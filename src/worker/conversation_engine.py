import json
import time
from logger import get_logger
from intent_detector import detect_intent

log = get_logger("conversation_engine")

CONV_STATE_TTL = 1800


def _format_price(cents: int, currency: str = "BRL") -> str:
    if currency == "BRL":
        return f"R$ {cents / 100:.2f}".replace(".", ",")
    return f"{cents / 100:.2f}"


async def _get_state(redis, tenant_id: str, contact_id: str) -> dict | None:
    key = f"conv_state:{tenant_id}:{contact_id}"
    try:
        data = await redis.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        log.warning(f"Redis get conv_state falhou: {e}")
        return None


async def _set_state(redis, tenant_id: str, contact_id: str, state: dict):
    key = f"conv_state:{tenant_id}:{contact_id}"
    state["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        await redis.setex(key, CONV_STATE_TTL, json.dumps(state))
    except Exception as e:
        log.error(f"Redis set conv_state falhou: {e}")


async def _clear_state(redis, tenant_id: str, contact_id: str):
    try:
        await redis.delete(f"conv_state:{tenant_id}:{contact_id}")
    except Exception:
        pass


async def process_message(
    redis_client,
    tenant_id: str,
    contact_id: str,
    message: str,
    sender_name: str,
    services: list,
    ai_profile: dict | None,
    history: list,
) -> str | None:
    """Ponto de entrada do motor. Retorna None se não há intenção detectada."""
    conv_state = await _get_state(redis_client, tenant_id, contact_id)
    current = conv_state.get("state", "idle") if conv_state else "idle"

    log.info(f"Engine | tenant={tenant_id[:8]}... | contact={contact_id[:8]}... | state={current}")

    if current == "ordering":
        return await _handle_ordering(
            redis_client, tenant_id, contact_id, message,
            sender_name, conv_state, services, ai_profile
        )

    if current == "awaiting_payment":
        return _handle_awaiting_payment(conv_state, ai_profile, sender_name)

    intent = detect_intent(message, services, conv_state)

    if intent["type"] == "cancel":
        await _clear_state(redis_client, tenant_id, contact_id)
        return f"Sem problemas, {sender_name}! Qualquer coisa é só chamar."

    if intent["type"] in ("service_match", "confirmation"):
        return await _start_order(
            redis_client, tenant_id, contact_id,
            sender_name, intent["service"], ai_profile
        )

    if intent["type"] == "browse":
        return await _show_menu(
            redis_client, tenant_id, contact_id,
            sender_name, services, ai_profile
        )

    return None


async def _show_menu(redis, tenant_id, contact_id, sender_name, services, ai_profile):
    active = [s for s in services if s.get("is_active")]
    if not active:
        return f"No momento não tenho serviços disponíveis, {sender_name}. Mas fique à vontade!"

    custom_msg = ai_profile.get("service_menu_message") if ai_profile else None
    lines = [custom_msg or f"Olha o que tenho pra você, {sender_name}!", ""]

    for i, svc in enumerate(sorted(active, key=lambda x: x.get("sort_order", 0)), 1):
        price = _format_price(svc["price_cents"], svc.get("currency", "BRL"))
        desc = f" — {svc['description']}" if svc.get("description") else ""
        lines.append(f"{i}. {svc['name']} • {price}{desc}")

    lines.extend(["", "É só me dizer qual te interessa!"])

    await _set_state(redis, tenant_id, contact_id, {
        "state": "browsing",
        "active_topic": active[0]["slug"] if len(active) == 1 else None,
    })

    return "\n".join(lines)


async def _start_order(redis, tenant_id, contact_id, sender_name, service, ai_profile):
    from database import create_order_draft

    followups = service.get("followup_questions") or []

    order_id = create_order_draft(
        tenant_id=tenant_id,
        contact_id=contact_id,
        service_id=str(service["id"]),
        price_cents=service["price_cents"],
        currency=service.get("currency", "BRL"),
        delivery_method=service.get("delivery_method", "telegram"),
    )

    if not followups:
        return await _finalize_order(
            redis, tenant_id, contact_id,
            sender_name, service, str(order_id), {}, ai_profile
        )

    first = followups[0]
    collected = {q["field"]: None for q in followups}

    await _set_state(redis, tenant_id, contact_id, {
        "state": "ordering",
        "service_id": str(service["id"]),
        "service_name": service["name"],
        "order_id": str(order_id),
        "active_topic": service["slug"],
        "pending_question_index": 0,
        "pending_question": first["field"],
        "followup_questions": followups,
        "collected": collected,
    })

    price = _format_price(service["price_cents"], service.get("currency", "BRL"))
    return (
        f"Ótimo, {sender_name}! Vou preparar seu pedido de {service['name']} ({price}).\n\n"
        f"{first['question']}"
    )


async def _handle_ordering(redis, tenant_id, contact_id, message, sender_name, state, services, ai_profile):
    cancel_words = ["cancelar", "cancela", "desisto", "nao quero", "esquece"]
    if any(w in message.lower() for w in cancel_words):
        from database import update_order_status
        order_id = state.get("order_id")
        if order_id:
            update_order_status(order_id, "cancelled")
        await _clear_state(redis, tenant_id, contact_id)
        return f"Pedido cancelado, {sender_name}. Se mudar de ideia, é só chamar!"

    field = state["pending_question"]
    state["collected"][field] = message.strip()

    followups = state.get("followup_questions", [])
    next_idx = state.get("pending_question_index", 0) + 1

    if next_idx < len(followups):
        next_q = followups[next_idx]
        state["pending_question_index"] = next_idx
        state["pending_question"] = next_q["field"]
        await _set_state(redis, tenant_id, contact_id, state)
        return next_q["question"]

    service = next((s for s in services if str(s["id"]) == state["service_id"]), None)
    if not service:
        await _clear_state(redis, tenant_id, contact_id)
        return f"Houve um problema com seu pedido, {sender_name}. Tente novamente."

    return await _finalize_order(
        redis, tenant_id, contact_id,
        sender_name, service, state["order_id"], state["collected"], ai_profile
    )


async def _finalize_order(redis, tenant_id, contact_id, sender_name, service, order_id, collected, ai_profile):
    from database import finalize_order

    auto = ai_profile.get("auto_approve_orders", False) if ai_profile else False
    needs_approval = service.get("requires_approval", True)

    next_status = "awaiting_payment" if (auto or not needs_approval) else "pending_approval"

    details_parts = [f"{k}: {v}" for k, v in collected.items() if v]
    custom_details = "\n".join(details_parts) if details_parts else None

    finalize_order(order_id, next_status, collected, custom_details)

    price = _format_price(service["price_cents"], service.get("currency", "BRL"))

    if next_status == "awaiting_payment":
        payment_info = (ai_profile or {}).get("payment_instructions", "")
        await _set_state(redis, tenant_id, contact_id, {
            "state": "awaiting_payment",
            "order_id": str(order_id),
            "service_name": service["name"],
        })
        msg = f"Perfeito, {sender_name}! Seu pedido de {service['name']} está confirmado!\n\nValor: {price}\n"
        if payment_info:
            msg += f"\n{payment_info}\n"
        msg += "\nAssim que o pagamento for confirmado, te aviso!"
        return msg

    await _clear_state(redis, tenant_id, contact_id)
    return (
        f"Recebi seu pedido de {service['name']}, {sender_name}!\n\n"
        f"Valor: {price}\nVou analisar e te retorno em breve com a confirmação."
    )


def _handle_awaiting_payment(state, ai_profile, sender_name):
    svc_name = state.get("service_name", "seu pedido")
    payment_info = (ai_profile or {}).get("payment_instructions", "")
    msg = f"Seu pedido de {svc_name} está aguardando pagamento, {sender_name}."
    if payment_info:
        msg += f"\n\n{payment_info}"
    msg += "\n\nAssim que confirmar o pagamento, te aviso!"
    return msg
