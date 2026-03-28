import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { getFlowState, touchFlowState } from '@/core/lib/redis';
import { createLogger } from '@/core/lib/logger';

const log = createLogger('telegram/status');

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const flowId = req.nextUrl.searchParams.get('flowId');

  try {
    // ─── Consulta por flowId (polling durante onboarding) ───
    if (flowId) {
      const flow = await getFlowState(flowId);
      if (!flow) {
        log.debug(`Flow expirado`, { flowId });
        return NextResponse.json({ success: true, data: { status: 'expired' } });
      }

      // Renovar TTL — frontend está fazendo polling, sessão está ativa
      await touchFlowState(flowId);

      const result = await db.query(
        `SELECT status FROM telegram_sessions WHERE id = $1`, [flow.sessionId]
      );
      const dbStatus = result.rows[0]?.status || flow.step;

      log.debug(`Status consultado via flowId`, {
        flowId: flowId.slice(0, 8) + '...',
        sessionId: flow.sessionId?.slice(0, 8) + '...',
        flowStep: flow.step,
        dbStatus,
      });

      return NextResponse.json({
        success: true,
        data: {
          status: dbStatus,
          flowId,
          sessionId: flow.sessionId,
          errorMessage: flow.errorMessage || null,
        },
      });
    }

    // ─── Consulta por tenantId (carregamento da página) ───
    if (tenantId) {
      const result = await db.query(
        `SELECT id, tenant_id, phone, status, created_at, updated_at
         FROM telegram_sessions WHERE tenant_id = $1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        log.debug(`Nenhuma sessão para tenant`, { tenantId });
        return NextResponse.json({ success: true, data: { status: 'not_configured' } });
      }

      const row = result.rows[0];
      log.debug(`Sessão encontrada via tenantId`, {
        sessionId: row.id?.slice(0, 8) + '...',
        status: row.status,
        updatedAt: row.updated_at,
      });

      return NextResponse.json({
        success: true,
        data: {
          id: row.id,
          tenantId: row.tenant_id,
          channel: 'telegram',
          status: row.status,
          phone: row.phone,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    }

    log.warn('Request sem tenantId nem flowId');
    return NextResponse.json(
      { success: false, error: 'Informe tenantId ou flowId' },
      { status: 400 }
    );
  } catch (error) {
    log.error('Exceção ao consultar status', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
