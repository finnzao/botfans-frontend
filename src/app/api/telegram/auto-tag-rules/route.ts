import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  try {
    const result = await db.query(
      `SELECT * FROM auto_tag_rules WHERE tenant_id = $1 ORDER BY priority DESC, created_at ASC`,
      [tenantId]
    );
    return NextResponse.json({
      success: true,
      data: { rules: result.rows, total: result.rowCount },
    });
  } catch (error) {
    console.error('Erro ao listar auto-tag rules:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, name, tag, patterns, matchType, matchField, applyOnce, description, priority } = await req.json();

    if (!tenantId || !name || !tag || !patterns || !Array.isArray(patterns)) {
      return NextResponse.json(
        { success: false, error: 'tenantId, name, tag e patterns obrigatórios' },
        { status: 400 }
      );
    }

    const sanitizedTag = tag.toLowerCase().trim().replace(/[^a-záàâãéèêíïóôõöúçñ0-9_\- ]/gi, '');
    if (!sanitizedTag) {
      return NextResponse.json({ success: false, error: 'Tag inválida' }, { status: 400 });
    }

    const result = await db.query(
      `INSERT INTO auto_tag_rules
       (tenant_id, name, tag, patterns, match_type, match_field, apply_once, description, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        tenantId, name, sanitizedTag, patterns,
        matchType || 'keyword', matchField || 'message',
        applyOnce || false, description || null, priority || 0,
      ]
    );

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Erro ao criar auto-tag rule:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, tenantId, ...fields } = body;

    if (!id || !tenantId) {
      return NextResponse.json({ success: false, error: 'id e tenantId obrigatórios' }, { status: 400 });
    }

    const fieldMap: Record<string, string> = {
      name: 'name', tag: 'tag', patterns: 'patterns', matchType: 'match_type',
      matchField: 'match_field', applyOnce: 'apply_once', description: 'description',
      priority: 'priority', isActive: 'is_active',
    };

    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;

    for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
      if (jsKey in fields) {
        sets.push(`${dbKey} = $${idx}`);
        vals.push(fields[jsKey]);
        idx++;
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhum campo para atualizar' }, { status: 400 });
    }

    sets.push('updated_at = NOW()');
    vals.push(id, tenantId);

    const result = await db.query(
      `UPDATE auto_tag_rules SET ${sets.join(', ')}
       WHERE id = $${idx} AND tenant_id = $${idx + 1}
       RETURNING *`,
      vals
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Regra não encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Erro ao atualizar auto-tag rule:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const tenantId = req.nextUrl.searchParams.get('tenantId');

  if (!id || !tenantId) {
    return NextResponse.json({ success: false, error: 'id e tenantId obrigatórios' }, { status: 400 });
  }

  try {
    const result = await db.query(
      'DELETE FROM auto_tag_rules WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ success: false, error: 'Regra não encontrada' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao deletar auto-tag rule:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
