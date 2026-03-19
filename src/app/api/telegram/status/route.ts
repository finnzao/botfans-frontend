import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { getFlowState } from '@/core/lib/redis';

/**
 * GET /api/telegram/status?tenantId=uuid  (consulta por tenant)
 * GET /api/telegram/status?flowId=uuid    (consulta por fluxo ativo)
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const flowId = req.nextUrl.searchParams.get('flowId');

  try {
    // Consulta por flowId (usado durante onboarding para polling)
    if (flowId) {
      const flow = await getFlowState(flowId);
      if (!flow) {
        return NextResponse.json({ success: true, data: { status: 'expired' } });
      }
      // Busca status atualizado do banco
      const result = await db.query(
        `SELECT status FROM telegram_sessions WHERE id = $1`, [flow.sessionId]
      );
      const dbStatus = result.rows[0]?.status || flow.step;
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

    // Consulta por tenantId (usado ao carregar a página)
    if (tenantId) {
      const result = await db.query(
        `SELECT id, tenant_id, phone, status, created_at, updated_at
         FROM telegram_sessions WHERE tenant_id = $1`,
        [tenantId]
      );

      if (result.rows.length === 0) {
        return NextResponse.json({ success: true, data: { status: 'not_configured' } });
      }

      const row = result.rows[0];
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

    return NextResponse.json(
      { success: false, error: 'Informe tenantId ou flowId' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Erro ao consultar status:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
