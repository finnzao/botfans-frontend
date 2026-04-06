"""
Patch para session_manager.py
============================
Substituir a função register_message_handler e generate_response
no session_manager.py existente por esta versão integrada com o
motor de conversação.

Instruções:
1. Adicionar imports no topo do session_manager.py:
   from database_services import get_active_services
   
2. Substituir register_message_handler pela versão abaixo
3. Manter generate_response como fallback (não remover)
"""

import os
import asyncio
import time
import random
from telethon import events
from telethon.tl.types import User
from logger import get_logger
from database import (
    save_contact,
    save_message,
    get_ai_profile,
    get_conversation_history,
)
from database_services import get_active_services

log = get_logger("session_manager")


async def register_message_handler(client, session_id: str, tenant_id: str):
    """Registra handler de mensagens com motor de conversação integrado."""
    from logger import log_separator
    log_separator(log, f"REGISTRANDO WATCH MODE | {session_id[:8]}...")

    ai_profile = get_ai_profile(tenant_id)

    import redis.asyncio as aioredis
    from conversation_engine import process_message as engine_process

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)

    @client.on(events.NewMessage(incoming=True, func=lambda e: e.is_private))
    async def on_new_message(event):
        msg_received_at = time.time()
        try:
            sender = await event.get_sender()
            if not isinstance(sender, User) or sender.bot:
                return

            message_text = event.message.text or ""
            if not message_text.strip():
                return

            log.info(
                f"MSG IN | {sender.first_name} (@{sender.username}) | "
                f"tenant={tenant_id[:8]}... | len={len(message_text)}"
            )

            contact_id = save_contact(tenant_id, sender)
            if not contact_id:
                return

            save_message(tenant_id, contact_id, "incoming", message_text)

            services = get_active_services(tenant_id)
            history = get_conversation_history(tenant_id, contact_id, limit=10)

            response = None
            if services:
                response = await engine_process(
                    redis_client=redis_client,
                    tenant_id=tenant_id,
                    contact_id=contact_id,
                    message=message_text,
                    sender_name=sender.first_name or "você",
                    services=services,
                    ai_profile=ai_profile,
                    history=history,
                )

            if response is None:
                response = _fallback_response(message_text, sender, ai_profile)

            if response:
                await asyncio.sleep(random.uniform(1.0, 3.0))
                await event.respond(response)

                elapsed_ms = int((time.time() - msg_received_at) * 1000)
                log.info(f"MSG OUT | to={sender.first_name} | len={len(response)} | {elapsed_ms}ms")
                save_message(tenant_id, contact_id, "outgoing", response, "ai", elapsed_ms)

        except Exception as e:
            log.error(f"Erro ao processar mensagem | {type(e).__name__}: {e}", exc_info=True)

    me = await client.get_me()
    log.info(f"Watch mode ATIVO | {me.first_name} (@{me.username}) | tenant={tenant_id[:8]}...")


def _fallback_response(message: str, sender, ai_profile: dict | None) -> str | None:
    """Resposta genérica quando o motor de conversação não tem match."""
    if not ai_profile:
        return None

    business = ai_profile.get("business_name", "")
    welcome = ai_profile.get("welcome_message", "")
    msg_lower = message.lower().strip()

    greetings = ["oi", "olá", "ola", "hey", "bom dia", "boa tarde", "boa noite", "hello", "hi", "eae"]
    if any(g in msg_lower for g in greetings):
        return welcome or f"Olá {sender.first_name}! Bem-vindo(a) à {business}! Como posso ajudar?"

    goodbyes = ["tchau", "bye", "até", "valeu", "obrigado", "obrigada", "flw"]
    if any(g in msg_lower for g in goodbyes):
        return f"Obrigado pelo contato, {sender.first_name}! Qualquer coisa é só chamar."

    return (
        f"Obrigado pela mensagem, {sender.first_name}! "
        f"Recebi e vou analisar. Em breve retorno."
    )
