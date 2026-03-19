import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { setFlowState } from '@/core/lib/redis';
import { randomUUID } from 'crypto';

/**
 * POST /api/telegram/start
 * 
 * Recebe apenas o phone. Faz POST para my.telegram.org/auth/send_password
 * para enviar código de verificação ao Telegram da cliente.
 */
export async function POST(req: NextRequest) {
  try {
    const { tenantId, phone } = await req.json();

    if (!tenantId || !phone) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: tenantId, phone' },
        { status: 400 }
      );
    }

    // Envia código via my.telegram.org
    const portalRes = await fetch('https://my.telegram.org/auth/send_password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ phone }),
    });

    const portalData = await portalRes.json();

    if (!portalData.random_hash) {
      const errorMsg = portalData.error === 'FLOOD_WAIT'
        ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
        : portalData.error === 'PHONE_NUMBER_INVALID'
          ? 'Número de telefone inválido. Verifique o formato.'
          : `Erro do Telegram: ${portalData.error || 'desconhecido'}`;

      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    // Cria ou atualiza registro no banco
    const existing = await db.query(
      'SELECT id FROM telegram_sessions WHERE tenant_id = $1', [tenantId]
    );

    let sessionId: string;
    if (existing.rows.length > 0) {
      sessionId = existing.rows[0].id;
      await db.query(
        `UPDATE telegram_sessions SET phone = $1, status = 'awaiting_portal_code', updated_at = NOW() WHERE id = $2`,
        [phone, sessionId]
      );
    } else {
      const result = await db.query(
        `INSERT INTO telegram_sessions (tenant_id, phone, status) VALUES ($1, $2, 'awaiting_portal_code') RETURNING id`,
        [tenantId, phone]
      );
      sessionId = result.rows[0].id;
    }

    // Gera flowId e salva estado no Redis (TTL 15 min)
    const flowId = randomUUID();
    await setFlowState(flowId, {
      tenantId,
      sessionId,
      phone,
      randomHash: portalData.random_hash,
      step: 'awaiting_portal_code',
    });

    return NextResponse.json({
      success: true,
      data: { flowId },
    });
  } catch (error) {
    console.error('Erro ao iniciar fluxo:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno. Tente novamente.' },
      { status: 500 }
    );
  }
}
