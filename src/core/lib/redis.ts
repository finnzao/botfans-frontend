import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';


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
        console.error('[Redis] Desistindo após 5 tentativas.');
        return null;
      }
      return Math.min(times * 500, 3000);
    },
  });

  client.on('error', (err) => {
    if (!globalForRedis._redisErrorLogged) {
      console.warn('[Redis] Não conectado:', err.message);
      globalForRedis._redisErrorLogged = true;
    }
  });

  client.on('connect', () => {
    globalForRedis._redisErrorLogged = false;
    console.log('[Redis] Conectado');
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
  TELEGRAM_START_SESSION: 'telegram:start_session',
  TELEGRAM_STATUS: 'telegram:status',
  TELEGRAM_MESSAGE: 'telegram:message',
} as const;

export async function publishToWorker(channel: string, data: Record<string, unknown>) {
  try {
    await getRedis().publish(channel, JSON.stringify(data));
  } catch (err) {
    console.warn('[Redis] Publish falhou:', (err as Error).message);
  }
}

export async function setFlowState(flowId: string, state: Record<string, unknown>) {
  try {
    await getRedis().setex(`flow:${flowId}`, 900, JSON.stringify(state));
  } catch (err) {
    console.warn('[Redis] setFlowState falhou:', (err as Error).message);
  }
}

export async function getFlowState(flowId: string) {
  try {
    const data = await getRedis().get(`flow:${flowId}`);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function deleteFlowState(flowId: string) {
  try {
    await getRedis().del(`flow:${flowId}`);
  } catch { /* ignore */ }
}