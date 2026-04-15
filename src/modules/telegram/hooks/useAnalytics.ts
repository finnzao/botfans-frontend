'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getFullAnalytics } from '../analytics.api';
import type { FullAnalytics, AnalyticsPeriod } from '../analytics.types';
const REFRESH_INTERVAL = 30000;
interface UseAnalyticsResult { data: FullAnalytics | null; loading: boolean; error: string | null; period: AnalyticsPeriod; setPeriod: (p: AnalyticsPeriod) => void; refresh: () => void; }
export function useAnalytics(tenantId: string): UseAnalyticsResult {
  const [data, setData] = useState<FullAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fetchData = useCallback(async () => {
    try { const res = await getFullAnalytics(tenantId, period); if (res.success && res.data) { setData(res.data); setError(null); } else { setError(res.error || 'Erro ao carregar dados'); } } catch { setError('Erro de conexão'); } finally { setLoading(false); }
  }, [tenantId, period]);
  useEffect(() => {
    setLoading(true); fetchData();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchData, REFRESH_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);
  return { data, loading, error, period, setPeriod, refresh: fetchData };
}
