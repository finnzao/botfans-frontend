import { NextRequest, NextResponse } from 'next/server';
import { getFlowState, setFlowState, publishToWorker, CHANNELS } from '@/core/lib/redis';
import { db } from '@/core/lib/db';

/**
 * POST /api/telegram/verify-session
 * 
 * Recebe código da sessão Telethon ou senha 2FA.
 * Publica para o worker Python completar a autenticação.
 * Worker responde via Redis com o resultado.
 */
export async function POST(req: NextRequest) {
  try {
    const { flowId, code, password2fa } = await req.json();

    if (!flowId) {
      return NextResponse.json(
        { success: false, error: 'flowId obrigatório' },
        { status: 400 }
      );
    }

    if (!code && !password2fa) {
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

    // Publica para o worker Python verificar
    await publishToWorker(CHANNELS.TELEGRAM_START_SESSION, {
      action: password2fa ? 'verify_2fa' : 'verify_code',
      flowId,
      sessionId: flow.sessionId,
      tenantId: flow.tenantId,
      phone: flow.phone,
      apiId: flow.apiId,
      apiHash: flow.apiHash,
      code: code || null,
      password2fa: password2fa || null,
    });

    // O worker atualiza o status via Redis.
    // Por enquanto retornamos sucesso e o frontend faz polling.
    // Em produção, usar WebSocket ou Server-Sent Events.
    const newStatus = password2fa ? 'active' : 'awaiting_session_code';

    await setFlowState(flowId, { ...flow, step: newStatus });

    // Atualiza banco
    await db.query(
      `UPDATE telegram_sessions SET status = $1, updated_at = NOW() WHERE id = $2`,
      [password2fa ? 'active' : 'awaiting_session_code', flow.sessionId]
    );

    return NextResponse.json({
      success: true,
      data: { status: newStatus },
    });
  } catch (error) {
    console.error('Erro ao verificar sessão:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno.' },
      { status: 500 }
    );
  }
}
