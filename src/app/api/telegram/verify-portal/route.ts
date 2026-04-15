import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { getFlowState, setFlowState, saveStelToken, publishToWorker, CHANNELS } from '@/core/lib/redis';
import { createLogger } from '@/core/lib/logger';
import { extractErrorCause } from '@/core/lib/utils';
import { randomUUID } from 'crypto';

const log = createLogger('telegram/verify-portal');

const MAX_RETRIES = 3;
const RETRY_DELAY = 1500;

async function safeFetch(reqId: string, url: string, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 15000, ...fetchOpts } = options;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { ...fetchOpts, signal: AbortSignal.timeout(timeout) });
      return { ok: true as const, res };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const cause = extractErrorCause(err);
      log.warn(`[${reqId}] Fetch ${url} tentativa ${attempt}/${MAX_RETRIES}`, { error: msg, cause });
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, RETRY_DELAY * attempt));
        continue;
      }
      return { ok: false as const, error: msg };
    }
  }
  return { ok: false as const, error: 'Falha após todas as tentativas.' };
}

async function updateSessionStatus(sessionId: string, status: string) {
  await db.query(`UPDATE telegram_sessions SET status = $1, updated_at = NOW() WHERE id = $2`, [status, sessionId]);
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  try {
    const { flowId, code } = await req.json();
    log.info(`[${reqId}] Recebido verify-portal`, { flowId, codeLength: code?.length });

    if (!flowId || !code) {
      return NextResponse.json({ success: false, error: 'Campos obrigatórios: flowId, code' }, { status: 400 });
    }

    const flow = await getFlowState(flowId);
    if (!flow) {
      return NextResponse.json({ success: false, error: 'Sessão expirada. Inicie novamente.' }, { status: 404 });
    }
    log.info(`[${reqId}] Flow recuperado`, { sessionId: flow.sessionId, step: flow.step });

    // 1. Login my.telegram.org
    const loginResult = await safeFetch(reqId, 'https://my.telegram.org/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ phone: flow.phone, random_hash: flow.randomHash, password: code }),
      redirect: 'manual',
    });

    if (!loginResult.ok) {
      return NextResponse.json({ success: false, error: `Não foi possível conectar: ${loginResult.error}` }, { status: 502 });
    }

    const loginBody = await loginResult.res.text();
    const cookies = loginResult.res.headers.getSetCookie?.() || [];
    log.http('POST', 'my.telegram.org/auth/login', loginResult.res.status, {
      bodyPreview: loginBody.substring(0, 200), cookiesCount: cookies.length,
    });

    const stelCookie = cookies.find((c: string) => c.startsWith('stel_token='));
    if (!stelCookie) {
      if (loginBody.includes('INVALID') || loginBody.includes('invalid')) {
        return NextResponse.json({ success: false, error: 'Código inválido.' }, { status: 400 });
      }
      if (loginBody.includes('FLOOD')) {
        return NextResponse.json({ success: false, error: 'Muitas tentativas. Aguarde.' }, { status: 429 });
      }
      log.error(`[${reqId}] Login falhou`, { body: loginBody.substring(0, 500) });
      return NextResponse.json({ success: false, error: 'Erro ao autenticar.' }, { status: 400 });
    }

    const token = stelCookie.split('=')[1].split(';')[0];
    const cookieHeader = `stel_token=${token}`;
    log.info(`[${reqId}] Login OK — stel_token obtido`);

    await saveStelToken(flowId, token);
    log.transition(flow.sessionId, flow.step, 'capturing_api');
    await updateSessionStatus(flow.sessionId, 'capturing_api');
    await setFlowState(flowId, { ...flow, stelToken: token, step: 'capturing_api' });

    // 2. Buscar /apps
    const appsResult = await safeFetch(reqId, 'https://my.telegram.org/apps', { headers: { Cookie: cookieHeader } });
    if (!appsResult.ok) {
      return NextResponse.json({ success: false, error: `Erro ao acessar apps: ${appsResult.error}` }, { status: 502 });
    }
    const appsHtml = await appsResult.res.text();
    log.http('GET', 'my.telegram.org/apps', appsResult.res.status, {
      bodyLength: appsHtml.length,
      containsCreateForm: appsHtml.includes('app_create_form'),
      containsAppConfig: appsHtml.includes('App configuration'),
    });

    let apiId: string | null = null;
    let apiHash: string | null = null;

    // 3. Extrair credenciais (app existente)
    const idMatch = appsHtml.match(/App\s+api_id[\s\S]*?<strong>\s*(\d+)\s*<\/strong>/i) || appsHtml.match(/<strong>\s*(\d{5,12})\s*<\/strong>/i);
    const hashMatch = appsHtml.match(/App\s+api_hash[\s\S]*?>\s*([a-f0-9]{32})\s*</i) || appsHtml.match(/uneditable-input[^>]*>\s*([a-f0-9]{32})\s*</i);

    if (idMatch && hashMatch) {
      apiId = idMatch[1];
      apiHash = hashMatch[1];
      log.info(`[${reqId}] App existente`, { apiId });

    } else if (appsHtml.includes('app_create_form') || appsHtml.includes('Create new application')) {
      log.info(`[${reqId}] Criando app novo`);
      const formHashMatch = appsHtml.match(/name="hash"\s*value="([^"]+)"/);
      if (!formHashMatch) {
        await updateSessionStatus(flow.sessionId, 'error');
        await setFlowState(flowId, { ...flow, step: 'error', errorMessage: 'Token do formulário não encontrado.' });
        return NextResponse.json({ success: false, error: 'Erro ao processar página.' }, { status: 500 });
      }

      const shortname = `botfans${Date.now().toString(36).slice(-6)}`;
      const createResult = await safeFetch(reqId, 'https://my.telegram.org/apps/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookieHeader },
        body: new URLSearchParams({
          hash: formHashMatch[1], app_title: 'BotFans CRM', app_shortname: shortname,
          app_url: '', app_platform: 'android', app_desc: '',
        }),
      });

      if (!createResult.ok) {
        await updateSessionStatus(flow.sessionId, 'error');
        return NextResponse.json({ success: false, error: 'Erro ao criar app.' }, { status: 502 });
      }

      const createBody = await createResult.res.text();
      if (createBody && createBody.trim().length > 0 && !createBody.includes('<')) {
        const errLower = createBody.toLowerCase();
        let userError = 'Não foi possível criar a aplicação. ';
        if (errLower.includes('flood')) userError += 'Muitas tentativas.';
        else if (errLower.includes('already')) userError += 'Já existe.';
        else userError += createBody.trim().substring(0, 100);
        await updateSessionStatus(flow.sessionId, 'error');
        return NextResponse.json({ success: false, error: userError }, { status: 400 });
      }

      const reloadResult = await safeFetch(reqId, 'https://my.telegram.org/apps', { headers: { Cookie: cookieHeader } });
      if (!reloadResult.ok) {
        await updateSessionStatus(flow.sessionId, 'error');
        return NextResponse.json({ success: false, error: 'Falhou ao ler credenciais.' }, { status: 502 });
      }
      const html2 = await reloadResult.res.text();
      const newId = html2.match(/App\s+api_id[\s\S]*?<strong>\s*(\d+)\s*<\/strong>/i) || html2.match(/<strong>\s*(\d{5,12})\s*<\/strong>/i);
      const newHash = html2.match(/App\s+api_hash[\s\S]*?>\s*([a-f0-9]{32})\s*</i) || html2.match(/uneditable-input[^>]*>\s*([a-f0-9]{32})\s*</i);
      if (newId && newHash) { apiId = newId[1]; apiHash = newHash[1]; }
    }

    if (!apiId || !apiHash) {
      await updateSessionStatus(flow.sessionId, 'error');
      await setFlowState(flowId, { ...flow, step: 'error', errorMessage: 'Credenciais não capturadas.' });
      return NextResponse.json({ success: false, error: 'Não foi possível capturar credenciais.' }, { status: 500 });
    }

    // 4. Salvar no banco
    await db.query(
      `UPDATE telegram_sessions SET api_id = $1, api_hash_encrypted = $2, status = 'api_captured', updated_at = NOW() WHERE id = $3`,
      [parseInt(apiId), apiHash, flow.sessionId]
    );
    log.transition(flow.sessionId, 'capturing_api', 'api_captured');

    // 5. Publicar para worker
    await publishToWorker(CHANNELS.TELEGRAM_START_SESSION, {
      flowId, sessionId: flow.sessionId, tenantId: flow.tenantId,
      phone: flow.phone, apiId: parseInt(apiId), apiHash,
    });

    // 6. Manter api_captured — worker muda para awaiting_session_code ou active
    await setFlowState(flowId, { ...flow, apiId: parseInt(apiId), apiHash, step: 'api_captured' });

    log.info(`[${reqId}] ✓ verify-portal concluído — aguardando worker`);
    return NextResponse.json({ success: true, data: { status: 'api_captured' } });
  } catch (error) {
    log.error(`[${reqId}] Exceção não tratada`, error);
    return NextResponse.json({ success: false, error: 'Erro interno.' }, { status: 500 });
  }
}
