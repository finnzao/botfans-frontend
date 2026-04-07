import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  const tags = req.nextUrl.searchParams.get('tags');           // comma-separated, contatos que TÊM essas tags
  const excludeTags = req.nextUrl.searchParams.get('excludeTags'); // comma-separated, contatos que NÃO TÊM
  const isNew = req.nextUrl.searchParams.get('isNew');
  const search = req.nextUrl.searchParams.get('search');
  const lastContactDays = req.nextUrl.searchParams.get('lastContactDays');
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 100);
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (tags) {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        conditions.push(`tags @> $${idx}::text[]`);
        params.push(tagList);
        idx++;
      }
    }

    if (excludeTags) {
      const exList = excludeTags.split(',').map(t => t.trim()).filter(Boolean);
      if (exList.length > 0) {
        conditions.push(`NOT (tags && $${idx}::text[])`);
        params.push(exList);
        idx++;
      }
    }

    if (isNew === 'true' || isNew === 'false') {
      conditions.push(`is_new = $${idx}`);
      params.push(isNew === 'true');
      idx++;
    }

    if (lastContactDays) {
      const days = parseInt(lastContactDays);
      if (!isNaN(days) && days > 0) {
        conditions.push(`last_contact_at >= NOW() - INTERVAL '${days} days'`);
      }
    }

    if (search) {
      conditions.push(
        `(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR telegram_username ILIKE $${idx})`
      );
      params.push(`%${search}%`);
      idx++;
    }

    const where = conditions.join(' AND ');

    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM contacts WHERE ${where}`,
      params
    );

    const result = await db.query(
      `SELECT id, telegram_user_id, telegram_username, first_name, last_name,
              phone, capture_data, tags, is_new, first_contact_at, last_contact_at
       FROM contacts WHERE ${where}
       ORDER BY last_contact_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);

    return NextResponse.json({
      success: true,
      data: {
        contacts: result.rows.map(row => ({
          id: row.id, tenantId, channel: 'telegram',
          externalUserId: row.telegram_user_id.toString(),
          username: row.telegram_username, firstName: row.first_name,
          lastName: row.last_name, phone: row.phone,
          captureData: row.capture_data, tags: row.tags || [],
          isNew: row.is_new, firstContactAt: row.first_contact_at,
          lastContactAt: row.last_contact_at,
        })),
        total,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    console.error('Erro ao listar contatos:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
