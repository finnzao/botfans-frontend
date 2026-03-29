import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { setFlowState } from '@/core/lib/redis';
import { createLogger } from '@/core/lib/logger';
import { randomUUID } from 'crypto';

const log = createLogger('telegram/start');

const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;

async function fetchWithRetry(reqId: string, url: string, options: RequestInit) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
      return { ok: true as const, res };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const cause = err instanceof Error && 'cause' in err ? String((err as Record<string, unknown>).cause) : null;
      log.warn(`[${reqId}] Fetch tentativa ${attempt}/${MAX_RETRIES} falhou`, { error: msg, cause });
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
        continue;
      }
      let userMsg = 'Não foi possível conectar ao Telegram. ';
      if (msg.includes('ECONNRESET')) userMsg += 'Conexão resetada. Tente novamente.';
      else if (msg.includes('timeout')) userMsg += 'Timeout. Tente novamente.';
      else userMsg += `Erro: ${msg}`;
      return { ok: false as const, error: userMsg };
    }
  }
  return { ok: false as const, error: 'Falha após todas as tentativas.' };
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  try {
    const { tenantId, phone } = await req.json();

    log.info(`[${reqId}] Iniciando fluxo`, { tenantId, phone: phone?.slice(0, 6) + '***' });

    if (!tenantId || !phone) {
      return NextResponse.json({ success: false, error: 'Campos obrigatórios: tenantId, phone' }, { status: 400 });
    }

    log.info(`[${reqId}] Enviando request para my.telegram.org/auth/send_password`);

    const result = await fetchWithRetry(reqId, 'https://my.telegram.org/auth/send_password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ phone }),
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    const portalRaw = await result.res.text();
    log.http('POST', 'my.telegram.org/auth/send_password', result.res.status, {
      bodyLength: portalRaw.length, bodyPreview: portalRaw.substring(0, 200),
    });

    let portalData: Record<string, unknown>;
    try {
      portalData = JSON.parse(portalRaw);
    } catch {
      log.error(`[${reqId}] Resposta não é JSON`, { raw: portalRaw.substring(0, 300) });
      return NextResponse.json({ success: false, error: 'Resposta inesperada do Telegram.' }, { status: 502 });
    }

    if (!portalData.random_hash) {
      const errorMsg = portalData.error === 'FLOOD_WAIT'
        ? 'Muitas tentativas. Aguarde alguns minutos.'
        : portalData.error === 'PHONE_NUMBER_INVALID'
          ? 'Número inválido. Verifique o formato.'
          : `Erro do Telegram: ${portalData.error || 'desconhecido'}`;
      return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
    }

    const existing = await db.query('SELECT id, status FROM telegram_sessions WHERE tenant_id = $1', [tenantId]);

    let sessionId: string;
    if (existing.rows.length > 0) {
      sessionId = existing.rows[0].id;
      log.info(`[${reqId}] Sessão existente`, { sessionId, oldStatus: existing.rows[0].status });
      log.transition(sessionId, existing.rows[0].status, 'awaiting_portal_code');
      await db.query(
        `UPDATE telegram_sessions SET phone = $1, status = 'awaiting_portal_code', updated_at = NOW() WHERE id = $2`,
        [phone, sessionId]
      );
    } else {
      const r = await db.query(
        `INSERT INTO telegram_sessions (tenant_id, phone, status) VALUES ($1, $2, 'awaiting_portal_code') RETURNING id`,
        [tenantId, phone]
      );
      sessionId = r.rows[0].id;
      log.info(`[${reqId}] Nova sessão criada`, { sessionId });
    }

    const flowId = randomUUID();
    await setFlowState(flowId, {
      tenantId, sessionId, phone,
      randomHash: portalData.random_hash as string,
      step: 'awaiting_portal_code',
    });

    log.info(`[${reqId}] Fluxo criado`, { flowId, sessionId });
    return NextResponse.json({ success: true, data: { flowId } });
  } catch (error) {
    log.error(`[${reqId}] Exceção não tratada`, error);
    return NextResponse.json({ success: false, error: 'Erro interno. Tente novamente.' }, { status: 500 });
  }
}
