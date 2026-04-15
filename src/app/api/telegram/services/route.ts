import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { requireTenantId, internalError } from '@/core/lib/utils';

export async function GET(req: NextRequest) {
  const tenantIdOrError = requireTenantId(req);
  if (tenantIdOrError instanceof NextResponse) return tenantIdOrError;
  const tenantId = tenantIdOrError;
  const activeOnly = req.nextUrl.searchParams.get('activeOnly') === 'true';

  try {
    const query = activeOnly
      ? `SELECT * FROM services WHERE tenant_id = $1 AND is_active = true ORDER BY sort_order, created_at`
      : `SELECT * FROM services WHERE tenant_id = $1 ORDER BY sort_order, created_at`;
    const result = await db.query(query, [tenantId]);
    return NextResponse.json({ success: true, data: { services: result.rows, total: result.rowCount } });
  } catch (error) {
    console.error('Erro ao listar serviços:', error);
    return internalError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, name, slug, category, description, priceCents, currency, isActive, requiresApproval, triggerKeywords, followupQuestions, deliveryMethod, maxPerDay, scheduleRequired, expirationHours, sortOrder } = body;
    if (!tenantId || !name || !slug) return NextResponse.json({ success: false, error: 'tenantId, name e slug obrigatórios' }, { status: 400 });
    const result = await db.query(
      `INSERT INTO services (tenant_id, name, slug, category, description, price_cents, currency, is_active, requires_approval, trigger_keywords, followup_questions, delivery_method, max_per_day, schedule_required, expiration_hours, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [tenantId, name, slug, category || 'content', description || null, priceCents || 0, currency || 'BRL', isActive !== false, requiresApproval !== false, triggerKeywords || [], JSON.stringify(followupQuestions || []), deliveryMethod || 'telegram', maxPerDay || null, scheduleRequired || false, expirationHours || null, sortOrder || 0]
    );
    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === '23505') return NextResponse.json({ success: false, error: 'Já existe um serviço com esse slug para este tenant' }, { status: 409 });
    console.error('Erro ao criar serviço:', error);
    return internalError();
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, tenantId, ...fields } = body;
    if (!id || !tenantId) return NextResponse.json({ success: false, error: 'id e tenantId obrigatórios' }, { status: 400 });
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    const fieldMap: Record<string, string> = { name: 'name', slug: 'slug', category: 'category', description: 'description', priceCents: 'price_cents', currency: 'currency', isActive: 'is_active', requiresApproval: 'requires_approval', triggerKeywords: 'trigger_keywords', deliveryMethod: 'delivery_method', maxPerDay: 'max_per_day', scheduleRequired: 'schedule_required', expirationHours: 'expiration_hours', sortOrder: 'sort_order' };
    for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
      if (jsKey in fields) { setClauses.push(`${dbKey} = $${idx}`); values.push(fields[jsKey]); idx++; }
    }
    if ('followupQuestions' in fields) { setClauses.push(`followup_questions = $${idx}`); values.push(JSON.stringify(fields.followupQuestions)); idx++; }
    if (setClauses.length === 0) return NextResponse.json({ success: false, error: 'Nenhum campo para atualizar' }, { status: 400 });
    setClauses.push(`updated_at = NOW()`);
    values.push(tenantId, id);
    const result = await db.query(`UPDATE services SET ${setClauses.join(', ')} WHERE tenant_id = $${idx} AND id = $${idx + 1} RETURNING *`, values);
    if (result.rowCount === 0) return NextResponse.json({ success: false, error: 'Serviço não encontrado' }, { status: 404 });
    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar serviço:', error);
    return internalError();
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const tenantIdOrError = requireTenantId(req);
  if (tenantIdOrError instanceof NextResponse) return tenantIdOrError;
  const tenantId = tenantIdOrError;
  if (!id) return NextResponse.json({ success: false, error: 'id obrigatório' }, { status: 400 });
  try {
    const result = await db.query(`UPDATE services SET is_active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    if (result.rowCount === 0) return NextResponse.json({ success: false, error: 'Serviço não encontrado' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao desativar serviço:', error);
    return internalError();
  }
}
