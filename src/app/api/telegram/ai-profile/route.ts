import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { tenantId, businessName, tone, welcomeMessage, systemPrompt } = await req.json();
    if (!tenantId || !businessName) {
      return NextResponse.json({ success: false, error: 'Campos obrigatórios: tenantId, businessName' }, { status: 400 });
    }

    const existing = await db.query('SELECT id FROM ai_profiles WHERE tenant_id = $1', [tenantId]);
    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE ai_profiles SET business_name=$1, tone=$2, welcome_message=$3, system_prompt=$4, updated_at=NOW() WHERE tenant_id=$5`,
        [businessName, tone || 'informal', welcomeMessage, systemPrompt, tenantId]
      );
    } else {
      await db.query(
        `INSERT INTO ai_profiles (tenant_id, business_name, tone, welcome_message, system_prompt) VALUES ($1,$2,$3,$4,$5)`,
        [tenantId, businessName, tone || 'informal', welcomeMessage, systemPrompt]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar perfil IA:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
