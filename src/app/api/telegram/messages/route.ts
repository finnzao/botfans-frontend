import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const contactId = req.nextUrl.searchParams.get('contactId');
  const direction = req.nextUrl.searchParams.get('direction');
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  try {
    const conditions: string[] = ['m.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (contactId) {
      conditions.push(`m.contact_id = $${paramIdx}`);
      params.push(contactId);
      paramIdx++;
    }

    if (direction && ['incoming', 'outgoing'].includes(direction)) {
      conditions.push(`m.direction = $${paramIdx}`);
      params.push(direction);
      paramIdx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM messages m WHERE ${where}`,
      params
    );

    const result = await db.query(
      `SELECT
        m.id,
        m.contact_id,
        m.direction,
        m.content,
        m.responded_by,
        m.created_at,
        m.sentiment,
        m.category,
        m.word_count,
        m.media_type,
        c.first_name,
        c.last_name,
        c.telegram_username,
        c.telegram_user_id
      FROM messages m
      JOIN contacts c ON c.id = m.contact_id
      WHERE ${where}
      ORDER BY m.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);

    return NextResponse.json({
      success: true,
      data: {
        messages: result.rows.map(row => ({
          id: row.id,
          contactId: row.contact_id,
          direction: row.direction,
          content: row.content,
          respondedBy: row.responded_by,
          createdAt: row.created_at,
          sentiment: row.sentiment,
          category: row.category,
          wordCount: row.word_count,
          mediaType: row.media_type,
          contact: {
            firstName: row.first_name,
            lastName: row.last_name,
            username: row.telegram_username,
            telegramUserId: row.telegram_user_id,
          },
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Erro ao buscar mensagens:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
