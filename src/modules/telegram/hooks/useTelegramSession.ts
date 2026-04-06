'use client';

import { useState, useEffect, useCallback } from 'react';
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

export function useTelegramSession(tenantId: string | undefined): SessionInfo {
  const [step, setStep] = useState<OnboardingStep>('phone');
  const [phone, setPhone] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
          setStep(res.data.hasSession ? 'disconnected' : 'phone');
        } else if (mapped === 'disconnected' && res.data.hasSession) {
          setStep('disconnected');
        } else {
          setStep(mapped);
          if (res.data.flowId) setFlowId(res.data.flowId);
        }
      }
    } catch { /* no session */ }
    finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { step, phone, hasSession, flowId, loading, refresh };
}
