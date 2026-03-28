/**
 * Logger centralizado para o BotFans CRM.
 * 
 * Fornece logs estruturados com:
 * - Timestamp ISO
 * - Módulo/contexto de origem
 * - Nível (INFO, WARN, ERROR, DEBUG)
 * - Dados serializados de forma segura (sem vazar secrets)
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const SENSITIVE_KEYS = ['apiHash', 'api_hash', 'api_hash_encrypted', 'stelToken', 'password', 'password2fa', 'code', 'random_hash', 'randomHash'];

function maskValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && SENSITIVE_KEYS.includes(key)) {
    if (value.length <= 4) return '****';
    return value.slice(0, 3) + '***' + value.slice(-2);
  }
  return value;
}

function safePrint(data: unknown, depth = 0): string {
  if (depth > 3) return '[...]';
  if (data === null || data === undefined) return String(data);
  if (typeof data === 'string') {
    if (data.length > 500) return data.substring(0, 500) + `... [${data.length} chars total]`;
    return data;
  }
  if (typeof data !== 'object') return String(data);
  if (data instanceof Error) return `${data.name}: ${data.message}`;

  const obj = data as Record<string, unknown>;
  const entries = Object.entries(obj).map(([k, v]) => {
    const masked = maskValue(k, v);
    if (typeof masked === 'object' && masked !== null) {
      return `${k}: ${safePrint(masked, depth + 1)}`;
    }
    return `${k}: ${masked}`;
  });
  return `{ ${entries.join(', ')} }`;
}

function formatLog(level: LogLevel, module: string, message: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level}] [${module}]`;
  const base = `${prefix} ${message}`;
  if (data !== undefined) {
    return `${base} | ${safePrint(data)}`;
  }
  return base;
}

export function createLogger(module: string) {
  return {
    debug(msg: string, data?: unknown) {
      if (process.env.NODE_ENV === 'production') return;
      console.log(formatLog('DEBUG', module, msg, data));
    },
    info(msg: string, data?: unknown) {
      console.log(formatLog('INFO', module, msg, data));
    },
    warn(msg: string, data?: unknown) {
      console.warn(formatLog('WARN', module, msg, data));
    },
    error(msg: string, data?: unknown) {
      console.error(formatLog('ERROR', module, msg, data));
    },
    /** Log de request/response HTTP externo (my.telegram.org etc) */
    http(method: string, url: string, status: number, extra?: Record<string, unknown>) {
      const arrow = status >= 400 ? '✗' : '✓';
      const msg = `${arrow} ${method} ${url} → ${status}`;
      if (status >= 400) {
        console.warn(formatLog('WARN', module, msg, extra));
      } else {
        console.log(formatLog('INFO', module, msg, extra));
      }
    },
    /** Log de transição de status da sessão */
    transition(sessionId: string, from: string, to: string) {
      console.log(formatLog('INFO', module, `Sessão ${sessionId.slice(0, 8)}... transição: ${from} → ${to}`));
    },
  };
}
