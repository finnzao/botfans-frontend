'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getSessionStatus } from '../api';
import type { SessionStatus } from '@/core/interfaces';

/**
 * Hook que faz polling do status da sessão Telegram a cada N segundos.
 * Útil durante o onboarding quando o worker Python está processando.
 */
export function useSessionPolling(tenantId: string, interval = 3000) {
  const [status, setStatus] = useState<SessionStatus | 'not_configured'>('not_configured');
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await getSessionStatus(tenantId);
      if (res.success && res.data) {
        setStatus(res.data.status as SessionStatus);
        if (res.data.id) setSessionId(res.data.id);
      }
    } catch {
      // silently fail - will retry
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  function startPolling() {
    stopPolling();
    timerRef.current = setInterval(checkStatus, interval);
  }

  function stopPolling() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    checkStatus();
    return stopPolling;
  }, [checkStatus]);

  return { status, loading, sessionId, startPolling, stopPolling, refresh: checkStatus };
}
