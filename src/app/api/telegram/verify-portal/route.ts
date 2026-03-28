import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { getFlowState, setFlowState, saveStelToken, publishToWorker, CHANNELS } from '@/core/lib/redis';
import { createLogger } from '@/core/lib/logger';
import { randomUUID } from 'crypto';

const log = createLogger('telegram/verify-portal');

/** Fetch com timeout, logging e tratamento de erros de rede */
async function safeFetch(
  reqId: string,
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<{ ok: true; res: Response } | { ok: false; error: string }> {
  const { timeout = 15000, ...fetchOpts } = options;
  try {
    const res = await fetch(url, {
      ...fetchOpts,
      signal: AbortSignal.timeout(timeout),
    });
    return { ok: true, res };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && 'cause' in err ? String((err as Record<string, unknown>).cause) : null;
    log.error(`[${reqId}] Fetch FALHOU: ${url}`, { error: msg, cause });
    return { ok: false, error: msg };
  }
}

async function updateSessionStatus(sessionId: string, status: string) {
  await db.query(
    `UPDATE telegram_sessions SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, sessionId]
  );
}

export async function POST(req: NextRequest) {
  const reqId = randomUUID().slice(0, 8);
  try {
    const body = await req.json();
    const { flowId, code } = body;

    log.info(`[${reqId}] Recebido verify-portal`, { flowId, codeLength: code?.length });

    if (!flowId || !code) {
      log.warn(`[${reqId}] Campos faltando`, { flowId: !!flowId, code: !!code });
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: flowId, code' },
        { status: 400 }
      );
    }

    // ─── Recuperar flow ───
    const flow = await getFlowState(flowId);
    if (!flow) {
      log.warn(`[${reqId}] Flow não encontrado (expirado?)`, { flowId });
      return NextResponse.json(
        { success: false, error: 'Sessão expirada. Inicie novamente.' },
        { status: 404 }
      );
    }
    log.info(`[${reqId}] Flow recuperado`, {
      sessionId: flow.sessionId,
      phone: flow.phone?.slice(0, 6) + '***',
      step: flow.step,
    });

    // ─── 1. Login no my.telegram.org ───
    log.info(`[${reqId}] Fazendo login em my.telegram.org/auth/login`);

    const loginResult = await safeFetch(reqId, 'https://my.telegram.org/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        phone: flow.phone,
        random_hash: flow.randomHash,
        password: code,
      }),
      redirect: 'manual',
    });

    if (!loginResult.ok) {
      return NextResponse.json(
        { success: false, error: `Não foi possível conectar ao Telegram: ${loginResult.error}` },
        { status: 502 }
      );
    }

    const loginRes = loginResult.res;

    const loginBody = await loginRes.text();
    const loginHeaders = Object.fromEntries(loginRes.headers.entries());
    const cookies = loginRes.headers.getSetCookie?.() || [];

    log.http('POST', 'my.telegram.org/auth/login', loginRes.status, {
      bodyLength: loginBody.length,
      bodyPreview: loginBody.substring(0, 300),
      cookiesCount: cookies.length,
      setCookies: cookies.map((c: string) => c.split(';')[0]),
      redirectLocation: loginRes.headers.get('location') || null,
    });

    // Extrair cookie stel_token
    const stelCookie = cookies.find((c: string) => c.startsWith('stel_token='));

    if (!stelCookie) {
      log.warn(`[${reqId}] stel_token NÃO encontrado nos cookies`, {
        allCookies: cookies,
        bodyContainsInvalid: loginBody.includes('INVALID') || loginBody.includes('invalid'),
        bodyContainsFlood: loginBody.includes('FLOOD'),
        bodyContainsTrue: loginBody === 'true',
        fullBody: loginBody.substring(0, 500),
      });

      if (loginBody.includes('INVALID') || loginBody.includes('invalid')) {
        return NextResponse.json(
          { success: false, error: 'Código inválido. Verifique e tente novamente.' },
          { status: 400 }
        );
      }
      if (loginBody.includes('FLOOD')) {
        return NextResponse.json(
          { success: false, error: 'Muitas tentativas. Aguarde alguns minutos.' },
          { status: 429 }
        );
      }

      // Caso especial: resposta "true" sem cookie (pode acontecer se cookie veio em header diferente)
      log.error(`[${reqId}] Login falhou sem motivo claro`, {
        status: loginRes.status,
        headers: loginHeaders,
        body: loginBody,
      });

      return NextResponse.json(
        { success: false, error: 'Erro ao autenticar. Tente novamente.' },
        { status: 400 }
      );
    }

    const token = stelCookie.split('=')[1].split(';')[0];
    const cookieHeader = `stel_token=${token}`;
    log.info(`[${reqId}] Login OK — stel_token obtido`, { tokenLength: token.length });

    // Salvar token no Redis (separado do flow, para reuso)
    await saveStelToken(flowId, token);

    // Atualizar status
    log.transition(flow.sessionId, flow.step, 'capturing_api');
    await updateSessionStatus(flow.sessionId, 'capturing_api');
    await setFlowState(flowId, { ...flow, stelToken: token, step: 'capturing_api' });

    // ─── 2. Buscar página /apps ───
    log.info(`[${reqId}] Buscando my.telegram.org/apps`);
    const appsResult = await safeFetch(reqId, 'https://my.telegram.org/apps', {
      headers: { Cookie: cookieHeader },
    });
    if (!appsResult.ok) {
      return NextResponse.json(
        { success: false, error: `Não foi possível acessar a página de apps: ${appsResult.error}` },
        { status: 502 }
      );
    }
    const appsRes = appsResult.res;
    const appsHtml = await appsRes.text();

    log.http('GET', 'my.telegram.org/apps', appsRes.status, {
      bodyLength: appsHtml.length,
      containsCreateForm: appsHtml.includes('app_create_form'),
      containsAppConfig: appsHtml.includes('App configuration'),
      containsApiId: appsHtml.includes('api_id'),
      containsApiHash: appsHtml.includes('api_hash'),
      titleMatch: appsHtml.match(/<title>(.*?)<\/title>/i)?.[1] || 'N/A',
    });

    let apiId: string | null = null;
    let apiHash: string | null = null;

    // ─── 3. Tentar extrair credenciais (app já existe) ───
    const existingIdMatch =
      appsHtml.match(/App\s+api_id[\s\S]*?<strong>\s*(\d+)\s*<\/strong>/i)
      || appsHtml.match(/<strong>\s*(\d{5,12})\s*<\/strong>/i);

    const existingHashMatch =
      appsHtml.match(/App\s+api_hash[\s\S]*?>\s*([a-f0-9]{32})\s*</i)
      || appsHtml.match(/uneditable-input[^>]*>\s*([a-f0-9]{32})\s*</i);

    if (existingIdMatch && existingHashMatch) {
      apiId = existingIdMatch[1];
      apiHash = existingHashMatch[1];
      log.info(`[${reqId}] App EXISTENTE encontrado`, { apiId, apiHashPrefix: apiHash.slice(0, 6) + '***' });

    } else if (appsHtml.includes('app_create_form') || appsHtml.includes('Create new application')) {
      // ─── 4. App NÃO existe — criar ───
      log.info(`[${reqId}] Nenhum app encontrado — criando novo`);

      const formHashMatch = appsHtml.match(/name="hash"\s*value="([^"]+)"/);
      if (!formHashMatch) {
        log.error(`[${reqId}] Hash CSRF não encontrado no HTML`, {
          htmlSnippet: appsHtml.substring(0, 800),
        });
        await updateSessionStatus(flow.sessionId, 'error');
        await setFlowState(flowId, { ...flow, step: 'error', errorMessage: 'Token do formulário não encontrado.' });
        return NextResponse.json(
          { success: false, error: 'Erro ao processar página do Telegram. Tente novamente.' },
          { status: 500 }
        );
      }

      const formHash = formHashMatch[1];
      const shortname = `botfans${Date.now().toString(36).slice(-6)}`;

      log.info(`[${reqId}] Criando app`, { formHash, shortname, platform: 'android' });

      const createResult = await safeFetch(reqId, 'https://my.telegram.org/apps/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookieHeader,
        },
        body: new URLSearchParams({
          hash: formHash,
          app_title: 'BotFans CRM',
          app_shortname: shortname,
          app_url: '',
          app_platform: 'android',
          app_desc: '',
        }),
      });

      if (!createResult.ok) {
        await updateSessionStatus(flow.sessionId, 'error');
        await setFlowState(flowId, { ...flow, step: 'error', errorMessage: `Erro de rede ao criar app: ${createResult.error}` });
        return NextResponse.json(
          { success: false, error: `Erro de conexão ao criar app. Tente novamente.` },
          { status: 502 }
        );
      }

      const createBody = await createResult.res.text();

      log.http('POST', 'my.telegram.org/apps/create', createResult.res.status, {
        bodyLength: createBody.length,
        bodyPreview: createBody.substring(0, 300),
        isEmpty: createBody.trim().length === 0,
        containsHtml: createBody.includes('<'),
      });

      // Verificar erro
      if (createBody && createBody.trim().length > 0 && !createBody.includes('<')) {
        log.error(`[${reqId}] /apps/create retornou erro`, { error: createBody.trim() });

        let userError = 'Não foi possível criar a aplicação. ';
        const errLower = createBody.toLowerCase();
        if (errLower.includes('short name') || errLower.includes('shortname')) userError += 'Nome curto inválido.';
        else if (errLower.includes('title')) userError += 'Título inválido.';
        else if (errLower.includes('flood')) userError += 'Muitas tentativas. Aguarde alguns minutos.';
        else if (errLower.includes('already')) userError += 'Aplicação já existe.';
        else userError += createBody.trim().substring(0, 100);

        await updateSessionStatus(flow.sessionId, 'error');
        await setFlowState(flowId, { ...flow, step: 'error', errorMessage: userError });
        return NextResponse.json({ success: false, error: userError }, { status: 400 });
      }

      log.info(`[${reqId}] App criado (resposta vazia = sucesso). Recarregando /apps...`);

      // Recarregar /apps para pegar credenciais
      const reloadResult = await safeFetch(reqId, 'https://my.telegram.org/apps', {
        headers: { Cookie: cookieHeader },
      });
      if (!reloadResult.ok) {
        await updateSessionStatus(flow.sessionId, 'error');
        await setFlowState(flowId, { ...flow, step: 'error', errorMessage: 'Erro ao recarregar página de apps.' });
        return NextResponse.json(
          { success: false, error: 'App criado mas falhou ao ler credenciais. Tente novamente.' },
          { status: 502 }
        );
      }
      const appsHtml2 = await reloadResult.res.text();

      log.http('GET', 'my.telegram.org/apps (reload)', reloadResult.res.status, {
        bodyLength: appsHtml2.length,
        containsApiId: appsHtml2.includes('api_id'),
        containsStrong: appsHtml2.includes('<strong>'),
      });

      const newIdMatch =
        appsHtml2.match(/App\s+api_id[\s\S]*?<strong>\s*(\d+)\s*<\/strong>/i)
        || appsHtml2.match(/<strong>\s*(\d{5,12})\s*<\/strong>/i);

      const newHashMatch =
        appsHtml2.match(/App\s+api_hash[\s\S]*?>\s*([a-f0-9]{32})\s*</i)
        || appsHtml2.match(/uneditable-input[^>]*>\s*([a-f0-9]{32})\s*</i);

      if (newIdMatch && newHashMatch) {
        apiId = newIdMatch[1];
        apiHash = newHashMatch[1];
        log.info(`[${reqId}] Credenciais extraídas do novo app`, { apiId });
      } else {
        log.error(`[${reqId}] Falha ao extrair credenciais após criação`, {
          htmlSnippet: appsHtml2.substring(0, 1000),
          idMatchFound: !!newIdMatch,
          hashMatchFound: !!newHashMatch,
        });
      }
    } else {
      log.error(`[${reqId}] Página /apps não reconhecida (nem form, nem config)`, {
        htmlSnippet: appsHtml.substring(0, 1000),
        containsLogin: appsHtml.includes('login') || appsHtml.includes('Login'),
        containsAuth: appsHtml.includes('auth'),
      });
    }

    // ─── 5. Verificar captura ───
    if (!apiId || !apiHash) {
      log.error(`[${reqId}] FALHA FINAL: credenciais não capturadas`, { apiId, apiHash: !!apiHash });
      await updateSessionStatus(flow.sessionId, 'error');
      await setFlowState(flowId, {
        ...flow,
        step: 'error',
        errorMessage: 'Não foi possível capturar as credenciais da API.',
      });
      return NextResponse.json(
        { success: false, error: 'Não foi possível capturar as credenciais. Tente novamente.' },
        { status: 500 }
      );
    }

    // ─── 6. Salvar no banco ───
    log.info(`[${reqId}] Salvando credenciais no banco`, { apiId, sessionId: flow.sessionId });
    await db.query(
      `UPDATE telegram_sessions 
       SET api_id = $1, api_hash_encrypted = $2, status = 'api_captured', updated_at = NOW() 
       WHERE id = $3`,
      [parseInt(apiId), apiHash, flow.sessionId]
    );
    log.transition(flow.sessionId, 'capturing_api', 'api_captured');

    // ─── 7. Publicar para worker Python ───
    const workerPayload = {
      flowId,
      sessionId: flow.sessionId,
      tenantId: flow.tenantId,
      phone: flow.phone,
      apiId: parseInt(apiId),
      apiHash,
    };
    log.info(`[${reqId}] Publicando para worker`, { channel: CHANNELS.TELEGRAM_START_SESSION, sessionId: flow.sessionId });
    await publishToWorker(CHANNELS.TELEGRAM_START_SESSION, workerPayload);

    // ─── 8. Atualizar estado ───
    await setFlowState(flowId, {
      ...flow,
      apiId: parseInt(apiId),
      apiHash,
      step: 'awaiting_session_code',
    });
    await updateSessionStatus(flow.sessionId, 'awaiting_session_code');
    log.transition(flow.sessionId, 'api_captured', 'awaiting_session_code');

    log.info(`[${reqId}] ✓ verify-portal concluído com sucesso`);
    return NextResponse.json({ success: true, data: { status: 'awaiting_session_code' } });
  } catch (error) {
    log.error(`[${reqId}] Exceção não tratada`, error);
    return NextResponse.json(
      { success: false, error: 'Erro interno. Tente novamente.' },
      { status: 500 }
    );
  }
}
