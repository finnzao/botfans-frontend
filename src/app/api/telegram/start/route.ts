import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { setFlowState } from '@/core/lib/redis';
import { createLogger } from '@/core/lib/logger';
import { randomUUID } from 'crypto';

const log = createLogger('telegram/start');

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  try {
    const body = await req.json();
    const { tenantId, phone } = body;

    log.info(`[${reqId}] Iniciando fluxo`, { tenantId, phone: phone?.slice(0, 6) + '***' });

    if (!tenantId || !phone) {
      log.warn(`[${reqId}] Campos faltando`, { tenantId: !!tenantId, phone: !!phone });
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: tenantId, phone' },
        { status: 400 }
      );
    }

    // ─── Enviar código via my.telegram.org ───
    log.info(`[${reqId}] Enviando request para my.telegram.org/auth/send_password`);

    let portalRes: Response;
    try {
      portalRes = await fetch('https://my.telegram.org/auth/send_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ phone }),
        signal: AbortSignal.timeout(15000), // timeout 15s
      });
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      const errCause = fetchErr instanceof Error && 'cause' in fetchErr ? String((fetchErr as Record<string, unknown>).cause) : null;
      log.error(`[${reqId}] Fetch para my.telegram.org FALHOU`, {
        error: errMsg,
        cause: errCause,
        type: fetchErr instanceof TypeError ? 'TypeError (rede/DNS)' : typeof fetchErr,
      });

      let userMsg = 'Não foi possível conectar ao Telegram. ';
      if (errMsg.includes('timeout') || errMsg.includes('abort')) {
        userMsg += 'Timeout na conexão. Tente novamente.';
      } else if (errMsg.includes('ENOTFOUND') || errMsg.includes('getaddrinfo') || errMsg.includes('DNS')) {
        userMsg += 'Erro de DNS. Verifique sua conexão.';
      } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ECONNRESET')) {
        userMsg += 'Conexão recusada. Tente novamente em alguns segundos.';
      } else {
        userMsg += `Erro de rede: ${errMsg}`;
      }

      return NextResponse.json(
        { success: false, error: userMsg },
        { status: 502 }
      );
    }

    const portalRaw = await portalRes.text();
    log.http('POST', 'my.telegram.org/auth/send_password', portalRes.status, {
      bodyLength: portalRaw.length,
      bodyPreview: portalRaw.substring(0, 200),
      headers: Object.fromEntries(portalRes.headers.entries()),
    });

    let portalData: Record<string, unknown>;
    try {
      portalData = JSON.parse(portalRaw);
    } catch {
      log.error(`[${reqId}] Resposta do portal não é JSON válido`, { raw: portalRaw.substring(0, 300) });
      return NextResponse.json(
        { success: false, error: 'Resposta inesperada do Telegram. Tente novamente.' },
        { status: 502 }
      );
    }

    log.info(`[${reqId}] Resposta do portal parseada`, {
      hasRandomHash: !!portalData.random_hash,
      error: portalData.error || null,
    });

    if (!portalData.random_hash) {
      const errorMsg = portalData.error === 'FLOOD_WAIT'
        ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
        : portalData.error === 'PHONE_NUMBER_INVALID'
          ? 'Número de telefone inválido. Verifique o formato.'
          : `Erro do Telegram: ${portalData.error || 'desconhecido'}`;

      log.warn(`[${reqId}] Portal rejeitou: ${portalData.error}`, { phone: phone.slice(0, 6) + '***' });
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    // ─── Criar/atualizar sessão no banco ───
    const existing = await db.query(
      'SELECT id, status FROM telegram_sessions WHERE tenant_id = $1', [tenantId]
    );

    let sessionId: string;
    if (existing.rows.length > 0) {
      sessionId = existing.rows[0].id;
      const oldStatus = existing.rows[0].status;
      log.info(`[${reqId}] Sessão existente encontrada`, { sessionId, oldStatus });
      log.transition(sessionId, oldStatus, 'awaiting_portal_code');

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
      log.info(`[${reqId}] Nova sessão criada`, { sessionId });
    }

    // ─── Salvar flow no Redis ───
    const flowId = randomUUID();
    await setFlowState(flowId, {
      tenantId,
      sessionId,
      phone,
      randomHash: portalData.random_hash as string,
      step: 'awaiting_portal_code',
    });

    log.info(`[${reqId}] Fluxo criado com sucesso`, { flowId, sessionId });

    return NextResponse.json({
      success: true,
      data: { flowId },
    });
  } catch (error) {
    log.error(`[${reqId}] Exceção não tratada`, error);
    return NextResponse.json(
      { success: false, error: 'Erro interno. Tente novamente.' },
      { status: 500 }
    );
  }
}
