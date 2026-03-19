import { NextRequest, NextResponse } from 'next/server';
import { publishToWorker, getSessionState, CHANNELS } from '@/core/lib/redis';
import { db } from '@/core/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, code, password2fa } = await req.json();

    if (!sessionId || !code) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: sessionId, code' },
        { status: 400 }
      );
    }

    const session = await getSessionState(sessionId);
    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Sessão expirada. Inicie novamente.' },
        { status: 404 }
      );
    }

    await publishToWorker(CHANNELS.TELEGRAM_VERIFY, {
      sessionId,
      tenantId: session.tenantId,
      code,
      password2fa: password2fa || null,
    });

    await db.query(
      `UPDATE telegram_sessions SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [sessionId]
    );

    return NextResponse.json({
      success: true,
      data: { sessionId, status: 'verifying' },
    });
  } catch (error) {
    console.error('Erro ao verificar código:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno ao verificar código' },
      { status: 500 }
    );
  }
}
