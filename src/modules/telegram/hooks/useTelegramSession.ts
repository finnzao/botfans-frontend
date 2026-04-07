'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getStatus } from '@/modules/telegram/api';
import { statusToStep } from '@/modules/telegram/types';
import type { OnboardingStep } from '@/modules/telegram/types';

export interface SessionInfo {
  step: OnboardingStep;
  phone: string | null;
  hasSession: boolean;
  flowId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook que monitora o estado da sessão Telegram.
 * 
 * Polling adaptativo:
 * - Quando ativo: poll a cada 60s (só health check)
 * - Quando disconnected com sessão: poll a cada 15s
 *   (detecta reconexão automática pelo worker)
 * - Quando em setup: poll a cada 30s
 */
export function useTelegramSession(tenantId: string | undefined): SessionInfo {
  const [step, setStep] = useState<OnboardingStep>('phone');
  const [phone, setPhone] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef<OnboardingStep>('phone');

  const refresh = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    try {
      const res = await getStatus(tenantId);
      if (res.success && res.data) {
        const mapped = statusToStep(res.data.status);
        setHasSession(!!res.data.hasSession);
        setPhone(res.data.phone || null);

        const needsFlow: OnboardingStep[] = ['portal_code', 'capturing', 'session_code', 'session_2fa', 'reconnecting'];
        if (needsFlow.includes(mapped) && !res.data.flowId) {
          const newStep = res.data.hasSession ? 'disconnected' : 'phone';
          setStep(newStep);
          stepRef.current = newStep;
        } else if (mapped === 'disconnected' && res.data.hasSession) {
          setStep('disconnected');
          stepRef.current = 'disconnected';
        } else {
          setStep(mapped);
          stepRef.current = mapped;
          if (res.data.flowId) setFlowId(res.data.flowId);
        }
      }
    } catch { /* no session */ }
    finally { setLoading(false); }
  }, [tenantId]);

  // Polling adaptativo baseado no estado
  useEffect(() => {
    refresh();

    function getInterval(): number {
      switch (stepRef.current) {
        case 'active': return 60000;      // 60s — só verificação
        case 'disconnected': return 15000; // 15s — detectar reconexão
        default: return 30000;             // 30s — setup
      }
    }

    function setupInterval() {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tenantId) {
        intervalRef.current = setInterval(() => {
          refresh().then(() => {
            // Reajustar intervalo se o estado mudou
            const newInterval = getInterval();
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = setInterval(refresh, newInterval);
            }
          });
        }, getInterval());
      }
    }

    setupInterval();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refresh, tenantId]);

  return { step, phone, hasSession, flowId, loading, refresh };
}
