import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { setFlowState, publishToWorker, CHANNELS } from '@/core/lib/redis';
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
      log.warn(`[${reqId}] Fetch tentativa ${attempt}/${MAX_RETRIES} falhou: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
        continue;
      }
      return { ok: false as const, error: `Não foi possível conectar ao Telegram: ${msg}` };
    }
  }
  return { ok: false as const, error: 'Falha após todas as tentativas.' };
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  try {
    const { tenantId, phone } = await req.json();

    if (!tenantId || !phone) {
      return NextResponse.json({ success: false, error: 'Campos obrigatórios: tenantId, phone' }, { status: 400 });
    }

    log.info(`[${reqId}] Start flow | phone=${phone.slice(0, 6)}***`);

    const existing = await db.query(
      `SELECT id, status, api_id, api_hash_encrypted,
              COALESCE(api_id, 0) > 0 AND COALESCE(length(api_hash_encrypted), 0) > 20 as has_credentials,
              session_string IS NOT NULL AND length(session_string) > 10 as has_session
       FROM telegram_sessions WHERE tenant_id = $1`,
      [tenantId]
    );

    if (existing.rows.length > 0 && existing.rows[0].has_credentials) {
      const row = existing.rows[0];
      log.info(`[${reqId}] Credenciais API existem — pulando portal`);

      await db.query(
        `UPDATE telegram_sessions SET phone = $1, status = 'api_captured', error_message = NULL, updated_at = NOW() WHERE id = $2`,
        [phone, row.id]
      );

      const flowId = randomUUID();
      await setFlowState(flowId, {
        tenantId, sessionId: row.id, phone,
        apiId: row.api_id,
        apiHash: row.api_hash_encrypted,
        step: 'api_captured',
      });

      await publishToWorker(CHANNELS.TELEGRAM_START_SESSION, {
        flowId, sessionId: row.id, tenantId, phone,
        apiId: row.api_id,
        apiHash: row.api_hash_encrypted,
      });

      return NextResponse.json({ success: true, data: { flowId, skipPortal: true } });
    }

    const result = await fetchWithRetry(reqId, 'https://my.telegram.org/auth/send_password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ phone }),
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    const portalRaw = await result.res.text();
    const rawLower = portalRaw.toLowerCase();

    if (rawLower.includes('too many') || rawLower.includes('please try again later')) {
      return NextResponse.json({
        success: false,
        error: 'Muitas tentativas. Aguarde alguns minutos.',
      }, { status: 429 });
    }

    let portalData: Record<string, unknown>;
    try {
      portalData = JSON.parse(portalRaw);
    } catch {
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

    let sessionId: string;
    if (existing.rows.length > 0) {
      sessionId = existing.rows[0].id;
      await db.query(
        `UPDATE telegram_sessions SET phone = $1, status = 'awaiting_portal_code', error_message = NULL, updated_at = NOW() WHERE id = $2`,
        [phone, sessionId]
      );
    } else {
      const r = await db.query(
        `INSERT INTO telegram_sessions (tenant_id, phone, status) VALUES ($1, $2, 'awaiting_portal_code') RETURNING id`,
        [tenantId, phone]
      );
      sessionId = r.rows[0].id;
    }

    const flowId = randomUUID();
    await setFlowState(flowId, {
      tenantId, sessionId, phone,
      randomHash: portalData.random_hash as string,
      step: 'awaiting_portal_code',
    });

    return NextResponse.json({ success: true, data: { flowId } });
  } catch (error) {
    log.error(`[${reqId}] Exceção`, error);
    return NextResponse.json({ success: false, error: 'Erro interno.' }, { status: 500 });
  }
}
