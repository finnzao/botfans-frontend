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
      return NextResponse.json(
        { success: false, error: 'flowId obrigatório' },
        { status: 400 }
      );
    }

    const trimmedCode = code?.trim() || null;
    const trimmedPassword = password2fa?.trim() || null;

    if (!trimmedCode && !trimmedPassword) {
      return NextResponse.json(
        { success: false, error: 'Informe o código ou a senha 2FA' },
        { status: 400 }
      );
    }

    const flow = await getFlowState(flowId);
    if (!flow) {
      return NextResponse.json(
        { success: false, error: 'Sessão expirada. Inicie novamente.' },
        { status: 404 }
      );
    }

    log.info(`[${reqId}] Flow recuperado`, {
      sessionId: flow.sessionId,
      currentStep: flow.step,
    });

    await touchFlowState(flowId);

    const action = trimmedPassword ? 'verify_2fa' : 'verify_code';
    const workerPayload = {
      action,
      flowId,
      sessionId: flow.sessionId,
      tenantId: flow.tenantId,
      phone: flow.phone,
      apiId: flow.apiId,
      apiHash: flow.apiHash,
      code: trimmedCode,
      password2fa: trimmedPassword,
    };

    log.info(`[${reqId}] Publicando para worker`, { action });
    await publishToWorker(CHANNELS.TELEGRAM_START_SESSION, workerPayload);

    const pendingStep = trimmedPassword ? 'verifying_2fa' : 'verifying_code';
    await setFlowState(flowId, { ...flow, step: pendingStep });

    log.info(`[${reqId}] ✓ verify-session publicado — aguardando worker`);

    return NextResponse.json({
      success: true,
      data: { status: pendingStep },
    });
  } catch (error) {
    log.error(`[${reqId}] Exceção não tratada`, error);
    return NextResponse.json(
      { success: false, error: 'Erro interno.' },
      { status: 500 }
    );
  }
}
