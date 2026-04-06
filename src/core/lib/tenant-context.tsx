'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface Tenant {
  tenantId: string;
  email: string;
  ownerName: string;
  displayName: string;
  createdAt?: string;
}

interface TenantContextValue {
  tenant: Tenant | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, ownerName: string) => Promise<boolean>;
  logout: () => void;
  updateTenantLocal: (partial: Partial<Tenant>) => void;
  error: string | null;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
  login: async () => false,
  register: async () => false,
  logout: () => {},
  updateTenantLocal: () => {},
  error: null,
});

const STORAGE_KEY = 'botfans_tenant';

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { setTenant(JSON.parse(stored)); } catch { localStorage.removeItem(STORAGE_KEY); }
    }
    setLoading(false);
  }, []);

  function persist(t: Tenant) {
    setTenant(t);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  }

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      });
      const data = await res.json();
      if (data.success && data.data) { persist(data.data); return true; }
      setError(data.error || 'Erro ao fazer login');
      return false;
    } catch { setError('Erro de conexão'); return false; }
  }, []);

  const register = useCallback(async (email: string, password: string, ownerName: string): Promise<boolean> => {
    setError(null);
    try {
      const res = await fetch('/api/telegram/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', email, password, ownerName }),
      });
      const data = await res.json();
      if (data.success && data.data) { persist(data.data); return true; }
      setError(data.error || 'Erro ao registrar');
      return false;
    } catch { setError('Erro de conexão'); return false; }
  }, []);

  const logout = useCallback(() => {
    setTenant(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const updateTenantLocal = useCallback((partial: Partial<Tenant>) => {
    setTenant(prev => {
      if (!prev) return prev;
      const updated = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading, login, register, logout, updateTenantLocal, error }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
