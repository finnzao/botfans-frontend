import { NextRequest, NextResponse } from 'next/server';
import type { NetworkError, PaginationParams } from '@/core/interfaces';

// ═══════════════════════════════════════════════════════════
// Error utilities (used by db.ts, logger.ts, verify-portal)
// ═══════════════════════════════════════════════════════════

/**
 * Extracts the `cause` from an error safely, without unsafe casts.
 */
export function extractErrorCause(err: unknown): string | null {
  if (err instanceof Error && err.cause != null) {
    return String(err.cause);
  }
  return null;
}

/**
 * Extracts network-specific details (code, address, port) from an Error.
 */
export function formatNetworkDetails(error: NetworkError): string {
  const parts: string[] = [];
  if (error.code) parts.push(`code: ${error.code}`);
  if (error.address) parts.push(`addr: ${error.address}`);
  if (error.port) parts.push(`port: ${error.port}`);
  return parts.length > 0 ? ` | ${parts.join(' | ')}` : '';
}

/**
 * Formats any error into a readable string with network details.
 */
export function formatError(error: unknown): string {
  if (error instanceof AggregateError) {
    const inner = error.errors?.map((e: Error, i: number) => {
      const netErr = e as NetworkError;
      let d = `  [${i}] ${e.name || 'Error'}: ${e.message}`;
      d += formatNetworkDetails(netErr);
      if (e.cause) d += ` (cause: ${e.cause})`;
      return d;
    }).join('\n') || '  (sem detalhes)';
    return `AggregateError: ${error.message || 'múltiplos erros'}\n${inner}`;
  }

  if (error instanceof Error) {
    const netErr = error as NetworkError;
    return `${error.name}: ${error.message}${formatNetworkDetails(netErr)}`;
  }

  return String(error);
}

// ═══════════════════════════════════════════════════════════
// Phone formatting (used by connection/page, AppShell, SessionCard)
// ═══════════════════════════════════════════════════════════

/**
 * Formats a Brazilian phone number for display.
 */
export function formatPhone(phone: string): string {
  if (phone.startsWith('+55') && phone.length >= 13) {
    const d = phone.slice(3);
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  return phone;
}

// ═══════════════════════════════════════════════════════════
// API route helpers (used by every route under /api/telegram)
// ═══════════════════════════════════════════════════════════

/**
 * Extracts and validates tenantId from query params.
 * Returns the tenantId or a NextResponse error.
 */
export function requireTenantId(req: NextRequest): string | NextResponse {
  const tenantId = req.nextUrl.searchParams.get('tenantId');
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'tenantId obrigatório' },
      { status: 400 }
    );
  }
  return tenantId;
}

/**
 * Parses pagination params from query string with safe defaults.
 */
export function parsePagination(req: NextRequest, maxLimit = 100): PaginationParams {
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') || '1'));
  const limit = Math.min(Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') || '50')), maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Builds a pagination response object.
 */
export function buildPaginationMeta(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Returns a standardized internal error response.
 */
export function internalError(message = 'Erro interno') {
  return NextResponse.json({ success: false, error: message }, { status: 500 });
}

// ═══════════════════════════════════════════════════════════
// Time formatting (used by ContactsList, dashboard, etc)
// ═══════════════════════════════════════════════════════════

/**
 * Formats a date string as a relative time (e.g. "3min", "2h", "15/03").
 */
export function timeAgo(dateStr: string): string {
  const m = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (m < 1) return 'agora';
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return new Date(dateStr).toLocaleDateString('pt-BR');
}

/**
 * Formats milliseconds into a human-readable duration.
 */
export function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Formats a price in cents to a BRL display string.
 */
export function formatPrice(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/**
 * Returns contact display name from firstName/lastName/username.
 */
export function contactDisplayName(
  firstName?: string | null,
  lastName?: string | null,
  username?: string | null,
  fallbackId?: string,
): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.join(' ') || (username ? `@${username}` : `User ${fallbackId || '?'}`);
}

/**
 * Returns initials from firstName and lastName.
 */
export function contactInitials(firstName?: string | null, lastName?: string | null): string {
  return ((firstName?.[0] || '') + (lastName?.[0] || '')).toUpperCase() || '?';
}
