import { NextRequest, NextResponse } from 'next/server';
import { getFlowState, setFlowState, touchFlowState, publishToWorker, CHANNELS } from '@/core/lib/redis';
import { db } from '@/core/lib/db';
import { createLogger } from '@/core/lib/logger';
import { randomUUID } from 'crypto';

const log = createLogger('telegram/verify-session');

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  try {
    const body = await req.json();
    const { flowId, code, password2fa } = body;

    log.info(`[${reqId}] Recebido verify-session`, {
      flowId,
      hasCode: !!code,
      has2fa: !!password2fa,
    });

    if (!flowId) {
      log.warn(`[${reqId}] flowId ausente`);
      return NextResponse.json(
        { success: false, error: 'flowId obrigatório' },
        { status: 400 }
      );
    }

    if (!code && !password2fa) {
      log.warn(`[${reqId}] Nem código nem senha 2FA informados`);
      return NextResponse.json(
        { success: false, error: 'Informe o código ou a senha 2FA' },
        { status: 400 }
      );
    }

    const flow = await getFlowState(flowId);
    if (!flow) {
      log.warn(`[${reqId}] Flow expirado`, { flowId });
      return NextResponse.json(
        { success: false, error: 'Sessão expirada. Inicie novamente.' },
        { status: 404 }
      );
    }

    log.info(`[${reqId}] Flow recuperado`, {
      sessionId: flow.sessionId,
      currentStep: flow.step,
      hasApiId: !!flow.apiId,
    });

    // Renovar TTL — cliente ainda está ativa
    await touchFlowState(flowId);

    const action = password2fa ? 'verify_2fa' : 'verify_code';
    const workerPayload = {
      action,
      flowId,
      sessionId: flow.sessionId,
      tenantId: flow.tenantId,
      phone: flow.phone,
      apiId: flow.apiId,
      apiHash: flow.apiHash,
      code: code || null,
      password2fa: password2fa || null,
    };

    log.info(`[${reqId}] Publicando para worker`, { action, channel: CHANNELS.TELEGRAM_START_SESSION });
    await publishToWorker(CHANNELS.TELEGRAM_START_SESSION, workerPayload);

    const newStatus = password2fa ? 'active' : 'awaiting_session_code';
    log.transition(flow.sessionId, flow.step, newStatus);

    await setFlowState(flowId, { ...flow, step: newStatus });
    await db.query(
      `UPDATE telegram_sessions SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, flow.sessionId]
    );

    log.info(`[${reqId}] ✓ verify-session concluído`, { newStatus });

    return NextResponse.json({
      success: true,
      data: { status: newStatus },
    });
  } catch (error) {
    log.error(`[${reqId}] Exceção não tratada`, error);
    return NextResponse.json(
      { success: false, error: 'Erro interno.' },
      { status: 500 }
    );
  }
}
