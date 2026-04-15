import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/core/lib/db';
import { requireTenantId, internalError } from '@/core/lib/utils';

export async function GET(req: NextRequest) {
  const tenantIdOrError = requireTenantId(req);
  if (tenantIdOrError instanceof NextResponse) return tenantIdOrError;
  const tenantId = tenantIdOrError;

  try {
    const result = await db.query(
      `SELECT
        id, tenant_id, business_name, tone, welcome_message, system_prompt,
        auto_approve_orders, business_hours, max_orders_per_day,
        payment_instructions, service_menu_message,
        greeting_morning, greeting_afternoon, greeting_evening,
        personality_traits, forbidden_topics, fallback_message,
        content_categories, upsell_enabled, upsell_message,
        response_style, use_emojis, use_audio_responses, max_message_length,
        away_message, is_configured,
        created_at, updated_at
       FROM ai_profiles WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        data: { profile: null, isConfigured: false },
      });
    }

    const row = result.rows[0];
    return NextResponse.json({
      success: true,
      data: {
        profile: {
          id: row.id,
          tenantId: row.tenant_id,
          businessName: row.business_name,
          tone: row.tone,
          welcomeMessage: row.welcome_message,
          systemPrompt: row.system_prompt,
          autoApproveOrders: row.auto_approve_orders,
          businessHours: row.business_hours,
          maxOrdersPerDay: row.max_orders_per_day,
          paymentInstructions: row.payment_instructions,
          serviceMenuMessage: row.service_menu_message,
          greetingMorning: row.greeting_morning,
          greetingAfternoon: row.greeting_afternoon,
          greetingEvening: row.greeting_evening,
          personalityTraits: row.personality_traits || [],
          forbiddenTopics: row.forbidden_topics || [],
          fallbackMessage: row.fallback_message,
          contentCategories: row.content_categories || [],
          upsellEnabled: row.upsell_enabled,
          upsellMessage: row.upsell_message,
          responseStyle: row.response_style,
          useEmojis: row.use_emojis,
          useAudioResponses: row.use_audio_responses,
          maxMessageLength: row.max_message_length,
          awayMessage: row.away_message,
          isConfigured: row.is_configured,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
        isConfigured: row.is_configured,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar perfil IA:', error);
    return internalError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, businessName } = body;

    if (!tenantId || !businessName) {
      return NextResponse.json(
        { success: false, error: 'Campos obrigatórios: tenantId, businessName' },
        { status: 400 }
      );
    }

    const existing = await db.query('SELECT id FROM ai_profiles WHERE tenant_id = $1', [tenantId]);

    const fields = {
      business_name: businessName,
      tone: body.tone || 'sensual',
      welcome_message: body.welcomeMessage || null,
      system_prompt: body.systemPrompt || null,
      auto_approve_orders: body.autoApproveOrders || false,
      business_hours: body.businessHours ? JSON.stringify(body.businessHours) : null,
      max_orders_per_day: body.maxOrdersPerDay || null,
      payment_instructions: body.paymentInstructions || null,
      service_menu_message: body.serviceMenuMessage || null,
      greeting_morning: body.greetingMorning || null,
      greeting_afternoon: body.greetingAfternoon || null,
      greeting_evening: body.greetingEvening || null,
      personality_traits: body.personalityTraits || [],
      forbidden_topics: body.forbiddenTopics || [],
      fallback_message: body.fallbackMessage || null,
      content_categories: body.contentCategories || [],
      upsell_enabled: body.upsellEnabled || false,
      upsell_message: body.upsellMessage || null,
      response_style: body.responseStyle || 'balanced',
      use_emojis: body.useEmojis !== false,
      use_audio_responses: body.useAudioResponses || false,
      max_message_length: body.maxMessageLength || 500,
      away_message: body.awayMessage || null,
      is_configured: true,
    };

    if (existing.rows.length > 0) {
      const setClauses = Object.keys(fields).map((key, i) => `${key}=$${i + 1}`);
      setClauses.push('updated_at=NOW()');
      const vals = Object.values(fields);
      vals.push(tenantId);

      await db.query(
        `UPDATE ai_profiles SET ${setClauses.join(', ')} WHERE tenant_id=$${vals.length}`,
        vals
      );
    } else {
      const keys = Object.keys(fields);
      const placeholders = keys.map((_, i) => `$${i + 2}`);
      const vals = [tenantId, ...Object.values(fields)];

      await db.query(
        `INSERT INTO ai_profiles (tenant_id, ${keys.join(', ')}) VALUES ($1, ${placeholders.join(', ')})`,
        vals
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar perfil IA:', error);
    return internalError();
  }
}
