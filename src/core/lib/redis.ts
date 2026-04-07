import Redis from 'ioredis';
import { createLogger } from './logger';

const log = createLogger('Redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const TTL = {
  FLOW: 60 * 30,
  SESSION: 60 * 60,
  STEL_TOKEN: 60 * 55,
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
        log.error(`Desistindo após ${times} tentativas`);
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
  TELEGRAM_BROADCAST: 'telegram:broadcast',
} as const;

export const QUEUES = {
  TELEGRAM_TASKS: 'queue:telegram:tasks',
} as const;

export async function publishToWorker(channel: string, data: Record<string, unknown>) {
  try {
    const payload = JSON.stringify({ ...data, _channel: channel, _publishedAt: new Date().toISOString() });
    const redis = getRedis();

    await redis.lpush(QUEUES.TELEGRAM_TASKS, payload);
    await redis.publish(channel, payload);

    log.info(`Publicado em ${channel} + fila`, { payloadSize: payload.length, keys: Object.keys(data) });
  } catch (err) {
    log.error(`Publish falhou em ${channel}`, err);
  }
}

// --- Session State ---

export async function setSessionState(sessionId: string, state: Record<string, unknown>) {
  const key = `session:${sessionId}`;
  try {
    const enriched = { ...state, _updatedAt: new Date().toISOString() };
    await getRedis().setex(key, TTL.SESSION, JSON.stringify(enriched));
  } catch (err) {
    log.error('setSessionState falhou', { key, error: err });
  }
}

export async function getSessionState(sessionId: string) {
  const key = `session:${sessionId}`;
  try {
    const data = await getRedis().get(key);
    if (!data) return null;
    return JSON.parse(data);
  } catch (err) {
    log.error('getSessionState falhou', { key, error: err });
    return null;
  }
}

// --- Flow State ---

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
      log.warn(`getFlowState: chave expirada`, { key });
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

export async function touchFlowState(flowId: string) {
  const key = `flow:${flowId}`;
  try {
    const renewed = await getRedis().expire(key, TTL.FLOW);
    if (!renewed) log.warn(`touchFlowState: chave expirada`, { key });
    return !!renewed;
  } catch {
    return false;
  }
}

export async function deleteFlowState(flowId: string) {
  const key = `flow:${flowId}`;
  try {
    await getRedis().del(key);
  } catch (err) {
    log.warn('deleteFlowState falhou', { key, error: err });
  }
}

// --- Stel Token ---

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
    if (!token) log.warn('getStelToken: expirado', { key });
    return token;
  } catch {
    return null;
  }
}
