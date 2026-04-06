import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

export interface TenantContext {
  tenantId: string;
  email: string;
  ownerName: string;
}

const TOKEN_HEADER = 'x-tenant-id';

export async function extractTenantId(req: NextRequest): Promise<string | null> {
  const fromHeader = req.headers.get(TOKEN_HEADER);
  if (fromHeader) return fromHeader;

  const fromQuery = req.nextUrl.searchParams.get('tenantId');
  if (fromQuery) return fromQuery;

  try {
    const body = await req.clone().json();
    return body?.tenantId ?? null;
  } catch {
    return null;
  }
}

export async function validateTenant(tenantId: string): Promise<TenantContext | null> {
  try {
    const result = await db.query(
      `SELECT id, email, owner_name FROM tenants WHERE id = $1 AND is_active = true`,
      [tenantId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return { tenantId: row.id, email: row.email, ownerName: row.owner_name };
  } catch {
    return null;
  }
}

export function unauthorizedResponse(message = 'Tenant não autorizado') {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

export function missingTenantResponse() {
  return NextResponse.json(
    { success: false, error: 'tenantId obrigatório' },
    { status: 400 }
  );
}
