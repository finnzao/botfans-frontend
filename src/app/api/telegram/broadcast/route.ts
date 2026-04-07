import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { publishToWorker, CHANNELS } from '@/core/lib/redis';

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  const jobId = req.nextUrl.searchParams.get('jobId');

  if (!tenantId) {
    return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
  }

  try {
    if (jobId) {
      // Detalhe de um job com stats
      const jobResult = await db.query(
        'SELECT * FROM broadcast_jobs WHERE id = $1 AND tenant_id = $2',
        [jobId, tenantId]
      );
      if (jobResult.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'Job não encontrado' }, { status: 404 });
      }

      const statsResult = await db.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'sent') as sent,
           COUNT(*) FILTER (WHERE status = 'failed') as failed,
           COUNT(*) FILTER (WHERE status = 'pending') as pending,
           COUNT(*) FILTER (WHERE status = 'skipped') as skipped
         FROM broadcast_messages WHERE broadcast_id = $1`,
        [jobId]
      );

      return NextResponse.json({
        success: true,
        data: { job: jobResult.rows[0], stats: statsResult.rows[0] },
      });
    }

    // Listar jobs
    const result = await db.query(
      'SELECT * FROM broadcast_jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50',
      [tenantId]
    );

    return NextResponse.json({
      success: true,
      data: { jobs: result.rows, total: result.rowCount },
    });
  } catch (error) {
    console.error('Erro ao buscar broadcast:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, action } = body;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });
    }

    // Ações de controle: start, pause, cancel
    if (action === 'start' || action === 'resume') {
      return handleStartBroadcast(body);
    }
    if (action === 'pause') {
      return handlePauseBroadcast(body);
    }
    if (action === 'cancel') {
      return handleCancelBroadcast(body);
    }

    // Criar novo broadcast
    return handleCreateBroadcast(body);
  } catch (error) {
    console.error('Erro no broadcast:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}

async function handleCreateBroadcast(body: Record<string, unknown>) {
  const {
    tenantId, name, messageText,
    filterTags, filterNoTags, filterIsNew, filterLastContactDays,
    rateLimitPerMinute,
  } = body as Record<string, unknown>;

  if (!name || !messageText) {
    return NextResponse.json(
      { success: false, error: 'name e messageText obrigatórios' },
      { status: 400 }
    );
  }

  // Preview: contar quantos contatos serão atingidos
  const previewCount = await countMatchingContacts(
    tenantId as string,
    (filterTags as string[]) || [],
    (filterNoTags as string[]) || [],
    filterIsNew as boolean | null,
    filterLastContactDays as number | null,
  );

  if (previewCount === 0) {
    return NextResponse.json(
      { success: false, error: 'Nenhum contato corresponde aos filtros selecionados' },
      { status: 400 }
    );
  }

  const result = await db.query(
    `INSERT INTO broadcast_jobs
     (tenant_id, name, message_text, filter_tags, filter_no_tags,
      filter_is_new, filter_last_contact_days, rate_limit_per_minute, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
     RETURNING *`,
    [
      tenantId, name, messageText,
      (filterTags as string[]) || [],
      (filterNoTags as string[]) || [],
      filterIsNew ?? null,
      filterLastContactDays ?? null,
      Math.min((rateLimitPerMinute as number) || 20, 30),
    ]
  );

  return NextResponse.json({
    success: true,
    data: { job: result.rows[0], previewCount },
  });
}

async function handleStartBroadcast(body: Record<string, unknown>) {
  const { tenantId, jobId } = body;

  if (!jobId) {
    return NextResponse.json({ success: false, error: 'jobId obrigatório' }, { status: 400 });
  }

  const job = await db.query(
    'SELECT * FROM broadcast_jobs WHERE id = $1 AND tenant_id = $2',
    [jobId, tenantId]
  );

  if (job.rows.length === 0) {
    return NextResponse.json({ success: false, error: 'Job não encontrado' }, { status: 404 });
  }

  const status = job.rows[0].status;
  if (!['draft', 'paused'].includes(status)) {
    return NextResponse.json(
      { success: false, error: `Não é possível iniciar job com status: ${status}` },
      { status: 400 }
    );
  }

  // Verificar se há sessão ativa
  const session = await db.query(
    `SELECT id FROM telegram_sessions WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId]
  );

  if (session.rows.length === 0) {
    return NextResponse.json(
      { success: false, error: 'Sessão Telegram não está ativa. Conecte primeiro.' },
      { status: 400 }
    );
  }

  // Publicar para o worker
  await publishToWorker('telegram:broadcast', {
    action: 'start',
    jobId,
    tenantId,
    sessionId: session.rows[0].id,
  });

  return NextResponse.json({
    success: true,
    data: { jobId, status: 'sending' },
  });
}

async function handlePauseBroadcast(body: Record<string, unknown>) {
  const { tenantId, jobId } = body;

  if (!jobId) {
    return NextResponse.json({ success: false, error: 'jobId obrigatório' }, { status: 400 });
  }

  await publishToWorker('telegram:broadcast', {
    action: 'pause',
    jobId,
    tenantId,
  });

  return NextResponse.json({ success: true, data: { jobId, status: 'pausing' } });
}

async function handleCancelBroadcast(body: Record<string, unknown>) {
  const { tenantId, jobId } = body;

  if (!jobId) {
    return NextResponse.json({ success: false, error: 'jobId obrigatório' }, { status: 400 });
  }

  await db.query(
    `UPDATE broadcast_jobs SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [jobId, tenantId]
  );

  await publishToWorker('telegram:broadcast', {
    action: 'cancel',
    jobId,
    tenantId,
  });

  return NextResponse.json({ success: true, data: { jobId, status: 'cancelled' } });
}

async function countMatchingContacts(
  tenantId: string,
  filterTags: string[],
  filterNoTags: string[],
  filterIsNew: boolean | null,
  filterLastContactDays: number | null,
): Promise<number> {
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let idx = 2;

  if (filterTags && filterTags.length > 0) {
    conditions.push(`tags @> $${idx}::text[]`);
    params.push(filterTags);
    idx++;
  }

  if (filterNoTags && filterNoTags.length > 0) {
    conditions.push(`NOT (tags && $${idx}::text[])`);
    params.push(filterNoTags);
    idx++;
  }

  if (filterIsNew !== null && filterIsNew !== undefined) {
    conditions.push(`is_new = $${idx}`);
    params.push(filterIsNew);
    idx++;
  }

  if (filterLastContactDays !== null && filterLastContactDays !== undefined) {
    conditions.push(`last_contact_at >= NOW() - INTERVAL '${parseInt(String(filterLastContactDays))} days'`);
  }

  const where = conditions.join(' AND ');
  const result = await db.query(`SELECT COUNT(*) as count FROM contacts WHERE ${where}`, params);
  return parseInt(result.rows[0].count);
}
