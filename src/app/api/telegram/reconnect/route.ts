import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { publishToWorker, CHANNELS, setFlowState } from '@/core/lib/redis';
import { createLogger } from '@/core/lib/logger';
import { randomUUID } from 'crypto';

const log = createLogger('telegram/reconnect');

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  try {
    const { tenantId } = await req.json();

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
    }

    const result = await db.query(
      `SELECT id, phone, api_id, api_hash_encrypted, status,
              session_string IS NOT NULL AND length(session_string) > 10 as has_session,
              COALESCE(api_id, 0) > 0 AND COALESCE(length(api_hash_encrypted), 0) > 20 as has_credentials
       FROM telegram_sessions WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Nenhuma sessão encontrada.' }, { status: 404 });
    }

    const row = result.rows[0];

    if (row.status === 'active') {
      return NextResponse.json({
        success: true,
        data: { status: 'active', message: 'Sessão já está ativa.' },
      });
    }

    if (row.status === 'reconnecting') {
      return NextResponse.json({
        success: true,
        data: { status: 'reconnecting', message: 'Reconexão em andamento.' },
      });
    }

    if (!row.has_credentials) {
      return NextResponse.json({
        success: false,
        error: 'Credenciais API não encontradas. Configure novamente.',
      }, { status: 400 });
    }

    const flowId = randomUUID();

    if (row.has_session) {
      await setFlowState(flowId, {
        tenantId,
        sessionId: row.id,
        phone: row.phone,
        step: 'reconnecting',
      });

      await db.query(
        `UPDATE telegram_sessions SET status = 'reconnecting', error_message = NULL, updated_at = NOW() WHERE id = $1`,
        [row.id]
      );

      await publishToWorker(CHANNELS.TELEGRAM_START_SESSION, {
        flowId,
        sessionId: row.id,
        tenantId,
        phone: row.phone,
        apiId: row.api_id,
        apiHash: row.api_hash_encrypted,
        action: 'reconnect',
      });

      log.info(`[${reqId}] Reconexão com session_string | session=${row.id.slice(0, 8)}...`);

      return NextResponse.json({
        success: true,
        data: { flowId, status: 'reconnecting' },
      });
    }

    await setFlowState(flowId, {
      tenantId,
      sessionId: row.id,
      phone: row.phone,
      step: 'api_captured',
    });

    await db.query(
      `UPDATE telegram_sessions SET status = 'api_captured', error_message = NULL, updated_at = NOW() WHERE id = $1`,
      [row.id]
    );

    await publishToWorker(CHANNELS.TELEGRAM_START_SESSION, {
      flowId,
      sessionId: row.id,
      tenantId,
      phone: row.phone,
      apiId: row.api_id,
      apiHash: row.api_hash_encrypted,
      action: 'start_with_credentials',
    });

    log.info(`[${reqId}] Reconexão sem session — usando credenciais | session=${row.id.slice(0, 8)}...`);

    return NextResponse.json({
      success: true,
      data: { flowId, status: 'api_captured' },
    });
  } catch (error) {
    log.error(`[${reqId}] Erro ao reconectar`, error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
