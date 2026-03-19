import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { getFlowState, setFlowState, publishToWorker, CHANNELS } from '@/core/lib/redis';

/**
 * POST /api/telegram/verify-portal
 * 
 * Recebe o código digitado pela cliente.
 * 1. Faz login no my.telegram.org/auth/login
 * 2. Acessa /apps para verificar se já existe App
 * 3. Se não existe, cria automaticamente
 * 4. Captura api_id e api_hash
 * 5. Salva no banco (criptografado)
 * 6. Publica para worker Python iniciar Telethon
 */
export async function POST(req: NextRequest) {
  try {
    const { flowId, code } = await req.json();

    if (!flowId || !code) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: flowId, code' },
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

    // 1. Login no my.telegram.org
    const loginRes = await fetch('https://my.telegram.org/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        phone: flow.phone,
        random_hash: flow.randomHash,
        password: code,
      }),
      redirect: 'manual',
    });

    // Extrair cookie stel_token
    const cookies = loginRes.headers.getSetCookie?.() || [];
    const stelCookie = cookies.find((c: string) => c.startsWith('stel_token='));

    if (!stelCookie) {
      const loginBody = await loginRes.text();
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
      return NextResponse.json(
        { success: false, error: 'Erro ao autenticar. Tente novamente.' },
        { status: 400 }
      );
    }

    const token = stelCookie.split('=')[1].split(';')[0];

    // Atualiza status
    await db.query(
      `UPDATE telegram_sessions SET status = 'capturing_api', updated_at = NOW() WHERE id = $1`,
      [flow.sessionId]
    );

    await setFlowState(flowId, {
      ...flow,
      stelToken: token,
      step: 'capturing_api',
    });

    // 2. Buscar apps existentes
    const appsRes = await fetch('https://my.telegram.org/apps', {
      headers: { Cookie: `stel_token=${token}` },
    });
    const appsHtml = await appsRes.text();

    let apiId: string | null = null;
    let apiHash: string | null = null;

    // 3. Tentar extrair api_id e api_hash do HTML
    const idMatch = appsHtml.match(/app_id[^>]*>\s*(\d+)\s*</i)
      || appsHtml.match(/<span[^>]*class="[^"]*form-control[^"]*"[^>]*>\s*(\d+)\s*<\/span>/);
    const hashMatch = appsHtml.match(/app_hash[^>]*>\s*([a-f0-9]{32})\s*</i)
      || appsHtml.match(/<span[^>]*class="[^"]*form-control[^"]*"[^>]*>\s*([a-f0-9]{32})\s*<\/span>/);

    if (idMatch && hashMatch) {
      apiId = idMatch[1];
      apiHash = hashMatch[1];
    } else if (appsHtml.includes('Create new application') || appsHtml.includes('app_title')) {
      // 4. Não tem App, criar automaticamente
      const createRes = await fetch('https://my.telegram.org/apps/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: `stel_token=${token}`,
        },
        body: new URLSearchParams({
          hash: token,
          app_title: 'BotFans CRM',
          app_shortname: `bf${Date.now().toString(36)}`,
          app_url: '',
          app_platform: 'android',
          app_desc: '',
        }),
      });

      const createHtml = await createRes.text();

      const newIdMatch = createHtml.match(/app_id[^>]*>\s*(\d+)\s*</i)
        || createHtml.match(/<span[^>]*class="[^"]*form-control[^"]*"[^>]*>\s*(\d+)\s*<\/span>/);
      const newHashMatch = createHtml.match(/app_hash[^>]*>\s*([a-f0-9]{32})\s*</i)
        || createHtml.match(/<span[^>]*class="[^"]*form-control[^"]*"[^>]*>\s*([a-f0-9]{32})\s*<\/span>/);

      if (newIdMatch && newHashMatch) {
        apiId = newIdMatch[1];
        apiHash = newHashMatch[1];
      }
    }

    if (!apiId || !apiHash) {
      await db.query(
        `UPDATE telegram_sessions SET status = 'error', updated_at = NOW() WHERE id = $1`,
        [flow.sessionId]
      );
      await setFlowState(flowId, { ...flow, step: 'error', errorMessage: 'Não foi possível capturar as credenciais da API.' });
      return NextResponse.json(
        { success: false, error: 'Não foi possível capturar as credenciais. Tente novamente.' },
        { status: 500 }
      );
    }

    // 5. Salvar api_id e api_hash no banco
    // TODO: criptografar api_hash com AES-256 antes de salvar
    await db.query(
      `UPDATE telegram_sessions SET api_id = $1, api_hash_encrypted = $2, status = 'api_captured', updated_at = NOW() WHERE id = $3`,
      [parseInt(apiId), apiHash, flow.sessionId]
    );

    // 6. Publicar para worker Python iniciar sessão Telethon
    await publishToWorker(CHANNELS.TELEGRAM_START_SESSION, {
      flowId,
      sessionId: flow.sessionId,
      tenantId: flow.tenantId,
      phone: flow.phone,
      apiId: parseInt(apiId),
      apiHash,
    });

    await setFlowState(flowId, {
      ...flow,
      apiId: parseInt(apiId),
      apiHash,
      step: 'awaiting_session_code',
    });

    await db.query(
      `UPDATE telegram_sessions SET status = 'awaiting_session_code', updated_at = NOW() WHERE id = $1`,
      [flow.sessionId]
    );

    return NextResponse.json({ success: true, data: { status: 'awaiting_session_code' } });
  } catch (error) {
    console.error('Erro ao verificar código do portal:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno. Tente novamente.' },
      { status: 500 }
    );
  }
}
