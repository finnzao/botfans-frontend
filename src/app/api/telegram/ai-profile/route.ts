import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';

export async function POST(req: NextRequest) {
  try {
    const {
      tenantId, businessName, tone, welcomeMessage, systemPrompt,
      autoApproveOrders, businessHours, maxOrdersPerDay,
      paymentInstructions, serviceMenuMessage,
    } = await req.json();

    if (!tenantId || !businessName) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: tenantId, businessName' },
        { status: 400 }
      );
    }

    const existing = await db.query('SELECT id FROM ai_profiles WHERE tenant_id = $1', [tenantId]);

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE ai_profiles SET
          business_name=$1, tone=$2, welcome_message=$3, system_prompt=$4,
          auto_approve_orders=$5, business_hours=$6, max_orders_per_day=$7,
          payment_instructions=$8, service_menu_message=$9,
          updated_at=NOW()
        WHERE tenant_id=$10`,
        [
          businessName, tone || 'informal', welcomeMessage, systemPrompt,
          autoApproveOrders || false,
          businessHours ? JSON.stringify(businessHours) : null,
          maxOrdersPerDay || null,
          paymentInstructions || null,
          serviceMenuMessage || null,
          tenantId,
        ]
      );
    } else {
      await db.query(
        `INSERT INTO ai_profiles
          (tenant_id, business_name, tone, welcome_message, system_prompt,
           auto_approve_orders, business_hours, max_orders_per_day,
           payment_instructions, service_menu_message)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          tenantId, businessName, tone || 'informal', welcomeMessage, systemPrompt,
          autoApproveOrders || false,
          businessHours ? JSON.stringify(businessHours) : null,
          maxOrdersPerDay || null,
          paymentInstructions || null,
          serviceMenuMessage || null,
        ]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar perfil IA:', error);
    return NextResponse.json({ success: false, error: 'Erro interno' }, { status: 500 });
  }
}
