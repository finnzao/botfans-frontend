import Redis from 'ioredis';
import { createLogger } from './logger';

const log = createLogger('Redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/** TTLs em segundos */
const TTL = {
  FLOW: 60 * 30,       // 30 min — fluxo de onboarding (era 15 min, pouco pra quem demora)
  SESSION: 60 * 60,    // 1 hora — estado de sessão temporário
  STEL_TOKEN: 60 * 55, // 55 min — cookie do my.telegram.org (expira em ~1h)
} as const;

const globalForRedis = globalThis as typeof globalThis & {
  _redis?: Redis;
  _redisSub?: Redis;
  _redisErrorLogged?: boolean;
};

function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 5) {
        log.error(`Desistindo após ${times} tentativas de reconexão`);
        return null;
      }
      const delay = Math.min(times * 500, 3000);
      log.warn(`Reconectando em ${delay}ms (tentativa ${times})`);
      return delay;
    },
  });

  client.on('error', (err) => {
    if (!globalForRedis._redisErrorLogged) {
      log.error('Erro de conexão', { message: err.message });
      globalForRedis._redisErrorLogged = true;
    }
  });

  client.on('connect', () => {
    globalForRedis._redisErrorLogged = false;
    log.info('Conectado');
  });

  client.on('reconnecting', () => {
    log.warn('Reconectando...');
  });

  return client;
}

export function getRedis(): Redis {
  if (!globalForRedis._redis) {
    globalForRedis._redis = createRedisClient();
  }
  return globalForRedis._redis;
}

export function getRedisSub(): Redis {
  if (!globalForRedis._redisSub) {
    globalForRedis._redisSub = createRedisClient();
  }
  return globalForRedis._redisSub;
}

export const CHANNELS = {
  TELEGRAM_INIT: 'telegram:init',
  TELEGRAM_VERIFY: 'telegram:verify',
  TELEGRAM_START_SESSION: 'telegram:start_session',
  TELEGRAM_STATUS: 'telegram:status',
  TELEGRAM_MESSAGE: 'telegram:message',
} as const;

// ─── Publish ───

export async function publishToWorker(channel: string, data: Record<string, unknown>) {
  try {
    const payload = JSON.stringify(data);
    await getRedis().publish(channel, payload);
    log.info(`Publicado em ${channel}`, { payloadSize: payload.length, keys: Object.keys(data) });
  } catch (err) {
    log.error(`Publish falhou em ${channel}`, err);
  }
}

// ─── Session State (fluxo antigo com sessionId) ───

export async function setSessionState(sessionId: string, state: Record<string, unknown>) {
  const key = `session:${sessionId}`;
  try {
    const enriched = { ...state, _updatedAt: new Date().toISOString() };
    await getRedis().setex(key, TTL.SESSION, JSON.stringify(enriched));
    log.debug(`setSessionState OK`, { key, step: state.step, ttl: TTL.SESSION });
  } catch (err) {
    log.error('setSessionState falhou', { key, error: err });
  }
}

export async function getSessionState(sessionId: string) {
  const key = `session:${sessionId}`;
  try {
    const data = await getRedis().get(key);
    if (!data) {
      log.debug(`getSessionState: chave não encontrada`, { key });
      return null;
    }
    const ttl = await getRedis().ttl(key);
    const parsed = JSON.parse(data);
    log.debug(`getSessionState OK`, { key, step: parsed.step, ttlRestante: ttl });
    return parsed;
  } catch (err) {
    log.error('getSessionState falhou', { key, error: err });
    return null;
  }
}

// ─── Flow State (fluxo novo simplificado com flowId) ───

export async function setFlowState(flowId: string, state: Record<string, unknown>) {
  const key = `flow:${flowId}`;
  try {
    const enriched = { ...state, _updatedAt: new Date().toISOString() };
    await getRedis().setex(key, TTL.FLOW, JSON.stringify(enriched));
    log.debug(`setFlowState OK`, { key, step: state.step, ttl: TTL.FLOW });
  } catch (err) {
    log.error('setFlowState falhou', { key, error: err });
  }
}

export async function getFlowState(flowId: string) {
  const key = `flow:${flowId}`;
  try {
    const data = await getRedis().get(key);
    if (!data) {
      log.warn(`getFlowState: chave expirada ou inexistente`, { key });
      return null;
    }
    const ttl = await getRedis().ttl(key);
    const parsed = JSON.parse(data);
    log.debug(`getFlowState OK`, { key, step: parsed.step, ttlRestante: ttl });
    return parsed;
  } catch (err) {
    log.error('getFlowState falhou', { key, error: err });
    return null;
  }
}

/** Renova o TTL de um flow sem alterar dados (útil enquanto cliente está ativa no frontend) */
export async function touchFlowState(flowId: string) {
  const key = `flow:${flowId}`;
  try {
    const renewed = await getRedis().expire(key, TTL.FLOW);
    if (!renewed) {
      log.warn(`touchFlowState: chave já expirada`, { key });
    }
    return !!renewed;
  } catch {
    return false;
  }
}

export async function deleteFlowState(flowId: string) {
  const key = `flow:${flowId}`;
  try {
    await getRedis().del(key);
    log.debug(`deleteFlowState OK`, { key });
  } catch (err) {
    log.warn('deleteFlowState falhou', { key, error: err });
  }
}

// ─── Stel Token (cookie do my.telegram.org, separado para reuso) ───

export async function saveStelToken(flowId: string, token: string) {
  const key = `stel:${flowId}`;
  try {
    await getRedis().setex(key, TTL.STEL_TOKEN, token);
    log.debug('saveStelToken OK', { key, ttl: TTL.STEL_TOKEN });
  } catch (err) {
    log.error('saveStelToken falhou', { key, error: err });
  }
}

export async function getStelToken(flowId: string): Promise<string | null> {
  const key = `stel:${flowId}`;
  try {
    const token = await getRedis().get(key);
    if (!token) log.warn('getStelToken: token expirado', { key });
    return token;
  } catch {
    return null;
  }
}
