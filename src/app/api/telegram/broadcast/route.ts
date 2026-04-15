import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { publishToWorker } from '@/core/lib/redis';
import { requireTenantId, internalError } from '@/core/lib/utils';

export async function GET(req: NextRequest) {
  const tenantIdOrError = requireTenantId(req);
  if (tenantIdOrError instanceof NextResponse) return tenantIdOrError;
  const tenantId = tenantIdOrError;
  const jobId = req.nextUrl.searchParams.get('jobId');

  try {
    if (jobId) {
      const jobResult = await db.query('SELECT * FROM broadcast_jobs WHERE id = $1 AND tenant_id = $2', [jobId, tenantId]);
      if (jobResult.rows.length === 0) return NextResponse.json({ success: false, error: 'Job não encontrado' }, { status: 404 });
      const statsResult = await db.query(
        `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'sent') as sent,
         COUNT(*) FILTER (WHERE status = 'failed') as failed, COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'skipped') as skipped FROM broadcast_messages WHERE broadcast_id = $1`, [jobId]
      );
      return NextResponse.json({ success: true, data: { job: jobResult.rows[0], stats: statsResult.rows[0] } });
    }
    const result = await db.query('SELECT * FROM broadcast_jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50', [tenantId]);
    return NextResponse.json({ success: true, data: { jobs: result.rows, total: result.rowCount } });
  } catch (error) {
    console.error('Erro ao buscar broadcast:', error);
    return internalError();
  }
}

interface BroadcastBody {
  tenantId: string;
  action?: string;
  jobId?: string;
  name?: string;
  messageText?: string;
  filterTags?: string[];
  filterNoTags?: string[];
  filterIsNew?: boolean | null;
  filterLastContactDays?: number | null;
  rateLimitPerMinute?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: BroadcastBody = await req.json();
    const { tenantId, action } = body;
    if (!tenantId) return NextResponse.json({ success: false, error: 'tenantId obrigatório' }, { status: 400 });

    if (action === 'start' || action === 'resume') return handleStartBroadcast(body);
    if (action === 'pause') return handlePauseBroadcast(body);
    if (action === 'cancel') return handleCancelBroadcast(body);
    return handleCreateBroadcast(body);
  } catch (error) {
    console.error('Erro no broadcast:', error);
    return internalError();
  }
}

async function handleCreateBroadcast(body: BroadcastBody) {
  const { tenantId, name, messageText, filterTags, filterNoTags, filterIsNew, filterLastContactDays, rateLimitPerMinute } = body;
  if (!name || !messageText) return NextResponse.json({ success: false, error: 'name e messageText obrigatórios' }, { status: 400 });

  const previewCount = await countMatchingContacts(tenantId, filterTags || [], filterNoTags || [], filterIsNew ?? null, filterLastContactDays ?? null);
  if (previewCount === 0) return NextResponse.json({ success: false, error: 'Nenhum contato corresponde aos filtros selecionados' }, { status: 400 });

  const result = await db.query(
    `INSERT INTO broadcast_jobs (tenant_id, name, message_text, filter_tags, filter_no_tags, filter_is_new, filter_last_contact_days, rate_limit_per_minute, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft') RETURNING *`,
    [tenantId, name, messageText, filterTags || [], filterNoTags || [], filterIsNew ?? null, filterLastContactDays ?? null, Math.min(rateLimitPerMinute || 20, 30)]
  );
  return NextResponse.json({ success: true, data: { job: result.rows[0], previewCount } });
}

async function handleStartBroadcast(body: BroadcastBody) {
  const { tenantId, jobId } = body;
  if (!jobId) return NextResponse.json({ success: false, error: 'jobId obrigatório' }, { status: 400 });

  const job = await db.query('SELECT * FROM broadcast_jobs WHERE id = $1 AND tenant_id = $2', [jobId, tenantId]);
  if (job.rows.length === 0) return NextResponse.json({ success: false, error: 'Job não encontrado' }, { status: 404 });
  if (!['draft', 'paused'].includes(job.rows[0].status)) {
    return NextResponse.json({ success: false, error: `Não é possível iniciar job com status: ${job.rows[0].status}` }, { status: 400 });
  }
  const session = await db.query(`SELECT id FROM telegram_sessions WHERE tenant_id = $1 AND status = 'active'`, [tenantId]);
  if (session.rows.length === 0) return NextResponse.json({ success: false, error: 'Sessão Telegram não está ativa.' }, { status: 400 });

  await publishToWorker('telegram:broadcast', { action: 'start', jobId, tenantId, sessionId: session.rows[0].id });
  return NextResponse.json({ success: true, data: { jobId, status: 'sending' } });
}

async function handlePauseBroadcast(body: BroadcastBody) {
  const { tenantId, jobId } = body;
  if (!jobId) return NextResponse.json({ success: false, error: 'jobId obrigatório' }, { status: 400 });
  await publishToWorker('telegram:broadcast', { action: 'pause', jobId, tenantId });
  return NextResponse.json({ success: true, data: { jobId, status: 'pausing' } });
}

async function handleCancelBroadcast(body: BroadcastBody) {
  const { tenantId, jobId } = body;
  if (!jobId) return NextResponse.json({ success: false, error: 'jobId obrigatório' }, { status: 400 });
  await db.query(`UPDATE broadcast_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [jobId, tenantId]);
  await publishToWorker('telegram:broadcast', { action: 'cancel', jobId, tenantId });
  return NextResponse.json({ success: true, data: { jobId, status: 'cancelled' } });
}

async function countMatchingContacts(tenantId: string, filterTags: string[], filterNoTags: string[], filterIsNew: boolean | null, filterLastContactDays: number | null): Promise<number> {
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let idx = 2;
  if (filterTags.length > 0) { conditions.push(`tags @> $${idx}::text[]`); params.push(filterTags); idx++; }
  if (filterNoTags.length > 0) { conditions.push(`NOT (tags && $${idx}::text[])`); params.push(filterNoTags); idx++; }
  if (filterIsNew !== null && filterIsNew !== undefined) { conditions.push(`is_new = $${idx}`); params.push(filterIsNew); idx++; }
  if (filterLastContactDays !== null && filterLastContactDays !== undefined) {
    conditions.push(`last_contact_at >= NOW() - INTERVAL '${parseInt(String(filterLastContactDays))} days'`);
  }
  const result = await db.query(`SELECT COUNT(*) as count FROM contacts WHERE ${conditions.join(' AND ')}`, params);
  return parseInt(result.rows[0].count);
}
