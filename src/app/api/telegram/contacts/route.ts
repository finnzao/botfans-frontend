import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  try {
    const result = await db.query(
      `SELECT id, telegram_user_id, telegram_username, first_name, last_name,
              phone, capture_data, tags, is_new, first_contact_at, last_contact_at
       FROM contacts WHERE tenant_id = $1 ORDER BY last_contact_at DESC`,
      [tenantId]
    );

    return NextResponse.json({
      success: true,
      data: {
        contacts: result.rows.map(row => ({
          id: row.id, tenantId, channel: 'telegram',
          externalUserId: row.telegram_user_id.toString(),
          username: row.telegram_username, firstName: row.first_name,
          lastName: row.last_name, phone: row.phone,
          captureData: row.capture_data, tags: row.tags,
          isNew: row.is_new, firstContactAt: row.first_contact_at,
          lastContactAt: row.last_contact_at,
        })),
        total: result.rowCount,
      },
    });
  } catch (error) {
    console.error('Erro ao listar contatos:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
