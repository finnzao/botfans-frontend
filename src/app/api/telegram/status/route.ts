import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { getFlowState, touchFlowState } from '@/core/lib/redis';
import { createLogger } from '@/core/lib/logger';

const log = createLogger('telegram/status');

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const flowId = req.nextUrl.searchParams.get('flowId');

  try {
    if (flowId) {
      const flow = await getFlowState(flowId);
      if (!flow) {
        log.debug(`Flow expirado`, { flowId });
        return NextResponse.json({ success: true, data: { status: 'expired' } });
      }

      await touchFlowState(flowId);

      const result = await db.query(
        `SELECT status, error_message FROM telegram_sessions WHERE id = $1`, [flow.sessionId]
      );
      const dbStatus = result.rows[0]?.status || flow.step;
      const errorMessage = result.rows[0]?.error_message || flow.errorMessage || null;

      const effectiveStatus = resolveStatus(flow.step, dbStatus);

      log.debug(`Status consultado via flowId`, {
        flowId: flowId.slice(0, 8) + '...',
        sessionId: flow.sessionId?.slice(0, 8) + '...',
        flowStep: flow.step,
        dbStatus,
        effectiveStatus,
      });

      return NextResponse.json({
        success: true,
        data: {
          status: effectiveStatus,
          flowId,
          sessionId: flow.sessionId,
          errorMessage: effectiveStatus === 'error' ? errorMessage : null,
        },
      });
    }

    if (tenantId) {
      const result = await db.query(
        `SELECT id, tenant_id, phone, status, session_string IS NOT NULL AND length(session_string) > 10 as has_session,
                created_at, updated_at
         FROM telegram_sessions WHERE tenant_id = $1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json({ success: true, data: { status: 'not_configured' } });
      }

      const row = result.rows[0];

      log.debug(`Sessão encontrada via tenantId`, {
        sessionId: row.id?.slice(0, 8) + '...',
        status: row.status,
        hasSession: row.has_session,
      });

      return NextResponse.json({
        success: true,
        data: {
          id: row.id,
          tenantId: row.tenant_id,
          channel: 'telegram',
          status: row.status,
          phone: row.phone,
          hasSession: row.has_session,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    }

    return NextResponse.json(
      { success: false, error: 'Informe tenantId ou flowId' },
      { status: 400 }
    );
  } catch (error) {
    log.error('Exceção ao consultar status', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

function resolveStatus(flowStep: string, dbStatus: string): string {
  const priority: Record<string, number> = {
    'idle': 0,
    'awaiting_portal_code': 1,
    'portal_authenticated': 2,
    'capturing_api': 3,
    'api_captured': 4,
    'verifying_code': 5,
    'verifying_2fa': 5,
    'awaiting_session_code': 6,
    'awaiting_2fa': 7,
    'reconnecting': 8,
    'active': 10,
    'disconnected': -1,
    'error': -2,
    'expired': -3,
  };

  const flowPriority = priority[flowStep] ?? 0;
  const dbPriority = priority[dbStatus] ?? 0;

  if (dbStatus === 'error') return 'error';
  if (flowStep === 'error') return 'error';

  return dbPriority >= flowPriority ? dbStatus : flowStep;
}
