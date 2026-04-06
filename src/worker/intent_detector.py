import unicodedata
from logger import get_logger

log = get_logger("intent_detector")

CANCEL_PATTERNS = {"cancelar", "cancela", "desisto", "nao quero", "esquece", "deixa", "para"}

CONFIRMATION_PATTERNS = {
    "quero", "pode ser", "fecha", "bora", "sim", "esse", "esse mesmo",
    "manda", "ok", "por favor", "pfv", "confirma", "quero esse",
    "pode mandar", "to querendo", "va", "vamos",
}

BROWSE_PATTERNS = {
    "tem algo", "o que tem", "quais servicos", "catalogo", "menu",
    "opcoes", "o que voce faz", "o que oferece", "algo especial",
    "algo diferente", "o que voce tem", "servicos", "produtos",
    "lista", "preco", "precos", "quanto custa", "valores", "tabela",
}


def _normalize(text: str) -> str:
    nfkd = unicodedata.normalize('NFKD', text)
    ascii_text = ''.join(c for c in nfkd if not unicodedata.combining(c))
    return ascii_text.lower().strip()


def detect_intent(message: str, services: list, conv_state: dict | None = None) -> dict:
    """
    Retorna tipo de intenção: service_match, confirmation, browse, cancel ou none.
    Funciona em 3 estágios: keywords → contexto → ambiguidade.
    """
    msg = _normalize(message)

    if any(p in msg for p in CANCEL_PATTERNS):
        return {"type": "cancel", "service": None, "confidence": 0.9}

    # Estágio 1: match direto de keywords
    best, best_score, best_kw = None, 0.0, None
    for svc in services:
        if not svc.get("is_active"):
            continue
        for kw in (svc.get("trigger_keywords") or []):
            kw_norm = _normalize(kw)
            if kw_norm in msg:
                score = max(len(kw_norm) / max(len(msg), 1), 0.5)
                if score > best_score:
                    best, best_score, best_kw = svc, score, kw

    if best and best_score >= 0.3:
        return {
            "type": "service_match",
            "service": best,
            "confidence": min(best_score + 0.3, 1.0),
        }

    # Estágio 2: confirmação baseada em contexto
    if conv_state and conv_state.get("state") == "browsing":
        if any(p in msg for p in CONFIRMATION_PATTERNS):
            topic = conv_state.get("active_topic")
            if topic:
                matched = next((s for s in services if s["slug"] == topic), None)
                if matched:
                    return {"type": "confirmation", "service": matched, "confidence": 0.8}

    # Estágio 3: browse
    if any(p in msg for p in BROWSE_PATTERNS):
        return {"type": "browse", "service": None, "confidence": 0.7}

    return {"type": "none", "service": None, "confidence": 0.0}
