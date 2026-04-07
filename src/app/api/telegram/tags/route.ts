import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

/**
 * GET /api/telegram/tags?tenantId=xxx
 *   → Lista todas as tags usadas pelo tenant com contagem
 *
 * GET /api/telegram/tags?tenantId=xxx&contactId=yyy
 *   → Lista tags de um contato específico
 *
 * POST /api/telegram/tags
 *   { tenantId, contactId, action: "add"|"remove"|"set", tags: ["tag1", "tag2"] }
 *   → Modifica tags de um contato
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const contactId = req.nextUrl.searchParams.get('contactId');

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  try {
    if (contactId) {
      const result = await db.query(
        'SELECT tags FROM contacts WHERE id = $1 AND tenant_id = $2',
        [contactId, tenantId]
      );
      if (result.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Contato não encontrado' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: { tags: result.rows[0].tags || [] } });
    }

    // Listar todas as tags do tenant com contagem
    const result = await db.query(
      `SELECT tag, COUNT(*) as count
       FROM contacts, unnest(tags) AS tag
       WHERE tenant_id = $1
       GROUP BY tag
       ORDER BY count DESC, tag ASC`,
      [tenantId]
    );

    return NextResponse.json({
      success: true,
      data: {
        tags: result.rows.map(r => ({ tag: r.tag, count: parseInt(r.count) })),
        total: result.rowCount,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar tags:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { tenantId, contactId, action, tags } = await req.json();

    if (!tenantId || !contactId || !action || !tags) {
      return NextResponse.json(
        { success: false, error: 'tenantId, contactId, action e tags obrigatórios' },
        { status: 400 }
      );
    }

    if (!Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json(
        { success: false, error: 'tags deve ser um array não vazio' },
        { status: 400 }
      );
    }

    // Sanitizar tags: lowercase, trim, sem caracteres especiais
    const sanitized = tags
      .map((t: string) => t.toLowerCase().trim().replace(/[^a-záàâãéèêíïóôõöúçñ0-9_\- ]/gi, ''))
      .filter((t: string) => t.length > 0 && t.length <= 50);

    if (sanitized.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Nenhuma tag válida fornecida' },
        { status: 400 }
      );
    }

    let result;

    if (action === 'add') {
      result = await db.query(
        `UPDATE contacts
         SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags || $1::text[]))),
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING tags`,
        [sanitized, contactId, tenantId]
      );
    } else if (action === 'remove') {
      result = await db.query(
        `UPDATE contacts
         SET tags = (SELECT ARRAY(SELECT unnest(tags) EXCEPT SELECT unnest($1::text[]))),
             updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING tags`,
        [sanitized, contactId, tenantId]
      );
    } else if (action === 'set') {
      result = await db.query(
        `UPDATE contacts SET tags = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3
         RETURNING tags`,
        [sanitized, contactId, tenantId]
      );
    } else {
      return NextResponse.json(
        { success: false, error: 'action deve ser: add, remove ou set' },
        { status: 400 }
      );
    }

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Contato não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { tags: result.rows[0].tags },
    });
  } catch (error) {
    console.error('Erro ao modificar tags:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
