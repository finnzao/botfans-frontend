import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'awaiting_payment', 'cancelled'],
  pending_approval: ['approved', 'rejected'],
  approved: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled', 'expired'],
  paid: ['in_production', 'delivered'],
  in_production: ['delivered', 'cancelled'],
};

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const status = req.nextUrl.searchParams.get('status');
  const contactId = req.nextUrl.searchParams.get('contactId');

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  try {
    const conditions: string[] = ['o.tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let idx = 2;

    if (status) {
      conditions.push(`o.status = $${idx}`);
      params.push(status);
      idx++;
    }

    if (contactId) {
      conditions.push(`o.contact_id = $${idx}`);
      params.push(contactId);
      idx++;
    }

    const where = conditions.join(' AND ');

    const result = await db.query(
      `SELECT o.*,
        s.name as service_name, s.category as service_category,
        c.first_name, c.last_name, c.telegram_username
       FROM orders o
       JOIN services s ON s.id = o.service_id
       JOIN contacts c ON c.id = o.contact_id
       WHERE ${where}
       ORDER BY o.created_at DESC`,
      params
    );

    return NextResponse.json({
      success: true,
      data: { orders: result.rows, total: result.rowCount },
    });
  } catch (error) {
    console.error('Erro ao listar pedidos:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, tenantId, status, notes } = await req.json();

    if (!id || !tenantId || !status) {
      return NextResponse.json(
        { success: false, error: 'id, tenantId e status obrigatórios' },
        { status: 400 }
      );
    }

    const current = await db.query(
      'SELECT status FROM orders WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (current.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: 'Pedido não encontrado' },
        { status: 404 }
      );
    }

    const currentStatus = current.rows[0].status;
    const allowed = VALID_TRANSITIONS[currentStatus];

    if (allowed && !allowed.includes(status)) {
      return NextResponse.json(
        { success: false, error: `Transição inválida: ${currentStatus} → ${status}` },
        { status: 400 }
      );
    }

    const extraSets: string[] = [];
    if (status === 'delivered') extraSets.push('delivered_at = NOW()');
    if (status === 'paid') extraSets.push("payment_status = 'paid'");

    const extra = extraSets.length > 0 ? `, ${extraSets.join(', ')}` : '';

    await db.query(
      `UPDATE orders
       SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()${extra}
       WHERE id = $3 AND tenant_id = $4`,
      [status, notes || null, id, tenantId]
    );

    return NextResponse.json({ success: true, data: { id, status } });
  } catch (error) {
    console.error('Erro ao atualizar pedido:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
