'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAiProfile } from '../assistant.api';
import type { AiProfile } from '../assistant.api';

export interface AiConfigStatus {
  isConfigured: boolean;
  profile: AiProfile | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useAiConfig(tenantId: string | undefined): AiConfigStatus {
  const [isConfigured, setIsConfigured] = useState(false);
  const [profile, setProfile] = useState<AiProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tenantId) { setLoading(false); return; }
    try {
      const res = await getAiProfile(tenantId);
      if (res.success && res.data) {
        setIsConfigured(res.data.isConfigured);
        setProfile(res.data.profile);
      }
    } catch {} finally { setLoading(false); }
  }, [tenantId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { isConfigured, profile, loading, refresh };
}
