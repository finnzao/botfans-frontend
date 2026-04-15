import { NextRequest, NextResponse } from 'next/server';
import { publishToWorker, getSessionState, CHANNELS } from '@/core/lib/redis';
import { db } from '@/core/lib/db';
import { internalError } from '@/core/lib/utils';

export async function POST(req: NextRequest) {
  try {
    const { sessionId, code, password2fa } = await req.json();
    if (!sessionId || (!code && !password2fa)) {
      return NextResponse.json({ success: false, error: 'Campos obrigatórios: sessionId, code ou password2fa' }, { status: 400 });
    }
    const session = await getSessionState(sessionId);
    if (!session) return NextResponse.json({ success: false, error: 'Sessão expirada. Inicie novamente.' }, { status: 404 });
    const pendingStatus = password2fa ? 'verifying_2fa' : 'verifying_code';
    await publishToWorker(CHANNELS.TELEGRAM_VERIFY, { sessionId, tenantId: session.tenantId, code: code || null, password2fa: password2fa || null });
    await db.query(`UPDATE telegram_sessions SET status = $1, updated_at = NOW() WHERE id = $2`, [pendingStatus, sessionId]);
    return NextResponse.json({ success: true, data: { sessionId, status: pendingStatus } });
  } catch (error) {
    console.error('Erro ao verificar código:', error);
    return internalError('Erro interno ao verificar código');
  }
}
