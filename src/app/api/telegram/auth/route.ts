import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import crypto from 'crypto';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === test;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'register') {
      return handleRegister(body);
    }
    if (action === 'login') {
      return handleLogin(body);
    }
    if (action === 'update_profile') {
      return handleUpdateProfile(body);
    }
    if (action === 'change_password') {
      return handleChangePassword(body);
    }
    if (action === 'get_profile') {
      return handleGetProfile(body);
    }

    return NextResponse.json(
      { success: false, error: 'action inválida' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

async function handleRegister(body: Record<string, string>) {
  const { email, password, ownerName, displayName } = body;

  if (!email || !password || !ownerName) {
    return NextResponse.json(
      { success: false, error: 'email, password e ownerName obrigatórios' },
      { status: 400 }
    );
  }

  const existing = await db.query('SELECT id FROM tenants WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ success: false, error: 'Email já cadastrado' }, { status: 409 });
  }

  const result = await db.query(
    `INSERT INTO tenants (owner_name, email, password_hash, display_name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, owner_name, display_name, created_at`,
    [ownerName, email.toLowerCase(), hashPassword(password), displayName || ownerName]
  );

  const t = result.rows[0];
  return NextResponse.json({
    success: true,
    data: {
      tenantId: t.id, email: t.email,
      ownerName: t.owner_name, displayName: t.display_name,
      createdAt: t.created_at,
    },
  });
}

async function handleLogin(body: Record<string, string>) {
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { success: false, error: 'email e password obrigatórios' },
      { status: 400 }
    );
  }

  const result = await db.query(
    `SELECT id, email, owner_name, display_name, password_hash, created_at
     FROM tenants WHERE email = $1 AND is_active = true`,
    [email.toLowerCase()]
  );

  if (result.rows.length === 0 || !verifyPassword(password, result.rows[0].password_hash)) {
    return NextResponse.json({ success: false, error: 'Credenciais inválidas' }, { status: 401 });
  }

  const t = result.rows[0];
  return NextResponse.json({
    success: true,
    data: {
      tenantId: t.id, email: t.email,
      ownerName: t.owner_name, displayName: t.display_name,
      createdAt: t.created_at,
    },
  });
}

async function handleGetProfile(body: Record<string, string>) {
  const { tenantId } = body;
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  const result = await db.query(
    `SELECT id, email, owner_name, display_name, created_at, updated_at
     FROM tenants WHERE id = $1 AND is_active = true`,
    [tenantId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Conta não encontrada' }, { status: 404 });
  }

  const t = result.rows[0];
  return NextResponse.json({
    success: true,
    data: {
      tenantId: t.id, email: t.email,
      ownerName: t.owner_name, displayName: t.display_name,
      createdAt: t.created_at, updatedAt: t.updated_at,
    },
  });
}

async function handleUpdateProfile(body: Record<string, string>) {
  const { tenantId, ownerName, displayName, email } = body;

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  if (!ownerName && !displayName && !email) {
    return NextResponse.json({ success: false, error: 'Nenhum campo para atualizar' }, { status: 400 });
  }

  if (email) {
    const existing = await db.query(
      'SELECT id FROM tenants WHERE email = $1 AND id != $2',
      [email.toLowerCase(), tenantId]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ success: false, error: 'Email já em uso por outra conta' }, { status: 409 });
    }
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (ownerName) { sets.push(`owner_name = $${idx}`); vals.push(ownerName); idx++; }
  if (displayName) { sets.push(`display_name = $${idx}`); vals.push(displayName); idx++; }
  if (email) { sets.push(`email = $${idx}`); vals.push(email.toLowerCase()); idx++; }
  sets.push('updated_at = NOW()');
  vals.push(tenantId);

  const result = await db.query(
    `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${idx} AND is_active = true
     RETURNING id, email, owner_name, display_name, created_at`,
    vals
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Conta não encontrada' }, { status: 404 });
  }

  const t = result.rows[0];
  return NextResponse.json({
    success: true,
    data: {
      tenantId: t.id, email: t.email,
      ownerName: t.owner_name, displayName: t.display_name,
      createdAt: t.created_at,
    },
  });
}

async function handleChangePassword(body: Record<string, string>) {
  const { tenantId, currentPassword, newPassword } = body;

  if (!tenantId || !currentPassword || !newPassword) {
    return NextResponse.json(
      { success: false, error: 'tenantId, currentPassword e newPassword obrigatórios' },
      { status: 400 }
    );
  }

  if (newPassword.length < 6) {
    return NextResponse.json(
      { success: false, error: 'Nova senha deve ter pelo menos 6 caracteres' },
      { status: 400 }
    );
  }

  const result = await db.query(
    'SELECT password_hash FROM tenants WHERE id = $1 AND is_active = true',
    [tenantId]
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Conta não encontrada' }, { status: 404 });
  }

  if (!verifyPassword(currentPassword, result.rows[0].password_hash)) {
    return NextResponse.json({ success: false, error: 'Senha atual incorreta' }, { status: 401 });
  }

  await db.query(
    'UPDATE tenants SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [hashPassword(newPassword), tenantId]
  );

  return NextResponse.json({ success: true });
}
