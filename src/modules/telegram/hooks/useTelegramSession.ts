'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getStatus } from '@/modules/telegram/api';
import { statusToStep } from '@/modules/telegram/types';
import type { OnboardingStep } from '@/modules/telegram/types';

export interface SessionInfo {
  step: OnboardingStep;
  phone: string | null;
  hasSession: boolean;
  hasCredentials: boolean;
  errorMessage: string | null;
  workerBusy: boolean;
  workerAction: string | null;
  flowId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useTelegramSession(tenantId: string | undefined, paused: boolean = false): SessionInfo {
  const [step, setStep] = useState<OnboardingStep>('phone');
  const [phone, setPhone] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [workerBusy, setWorkerBusy] = useState(false);
  const [workerAction, setWorkerAction] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    try {
      const res = await getStatus(tenantId);
      if (res.success && res.data) {
        const d = res.data;
        const mapped = statusToStep(d.status);
        setHasSession(!!d.hasSession);
        setHasCredentials(!!d.hasCredentials);
        setPhone(d.phone || null);
        setErrorMessage(d.errorMessage || null);
        setWorkerBusy(!!d.workerBusy);
        setWorkerAction(d.workerAction || null);

        const needsFlow: OnboardingStep[] = ['portal_code', 'capturing', 'session_code', 'session_2fa', 'reconnecting'];
        if (needsFlow.includes(mapped) && !d.flowId) {
          setStep(d.hasSession ? 'disconnected' : 'phone');
        } else if (mapped === 'disconnected') {
          setStep('disconnected');
        } else {
          setStep(mapped);
          if (d.flowId) setFlowId(d.flowId);
        }
      }
    } catch {}
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!paused) {
      refresh();
      if (tenantId) {
        intervalRef.current = setInterval(refresh, 30000);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refresh, tenantId, paused]);

  return {
    step, phone, hasSession, hasCredentials, errorMessage,
    workerBusy, workerAction, flowId, loading, refresh,
  };
}
