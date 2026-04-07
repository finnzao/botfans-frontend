"""
Auto-tagger engine — aplica tags automaticamente baseado em regras.

Executa após cada mensagem recebida:
1. Carrega regras ativas do tenant (com cache de 60s)
2. Para cada regra, verifica se a mensagem faz match
3. Se sim, adiciona a tag ao contato

Tipos de match suportados:
- keyword: contém uma das palavras-chave (case insensitive, sem acentos)
- regex: match de expressão regular
- ai: (futuro) análise por IA — placeholder, não implementado ainda
"""

import re
import time
import unicodedata
from logger import get_logger

log = get_logger("auto_tagger")

# Cache de regras por tenant (evita query a cada mensagem)
_rules_cache: dict[str, tuple[float, list[dict]]] = {}
CACHE_TTL = 60  # segundos


def _normalize(text: str) -> str:
    """Remove acentos e converte para minúsculas."""
    nfkd = unicodedata.normalize("NFKD", text)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()


def _get_cached_rules(tenant_id: str) -> list[dict] | None:
    """Retorna regras do cache se ainda válidas."""
    entry = _rules_cache.get(tenant_id)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None


def _set_cached_rules(tenant_id: str, rules: list[dict]):
    """Atualiza cache de regras."""
    _rules_cache[tenant_id] = (time.time(), rules)


def invalidate_rules_cache(tenant_id: str):
    """Invalida cache quando regras são criadas/editadas/deletadas."""
    _rules_cache.pop(tenant_id, None)


def _match_keyword(text_normalized: str, patterns: list[str]) -> bool:
    """Verifica se o texto contém alguma das keywords."""
    for pattern in patterns:
        pattern_norm = _normalize(pattern)
        if pattern_norm in text_normalized:
            return True
    return False


def _match_regex(text: str, patterns: list[str]) -> bool:
    """Verifica se o texto faz match com algum regex."""
    for pattern in patterns:
        try:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        except re.error:
            log.warning(f"Regex inválido: {pattern}")
    return False


def process_auto_tags(
    tenant_id: str,
    contact_id: str,
    message: str,
    sender_name: str = "",
    sender_username: str = "",
    current_tags: list[str] = None,
) -> list[str]:
    """
    Processa auto-tags para uma mensagem recebida.
    Retorna lista de novas tags aplicadas (pode ser vazia).
    """
    from database_tags import get_auto_tag_rules, add_tags_to_contact

    # Cache de regras
    rules = _get_cached_rules(tenant_id)
    if rules is None:
        rules = get_auto_tag_rules(tenant_id, active_only=True)
        _set_cached_rules(tenant_id, rules)

    if not rules:
        return []

    current = set(current_tags or [])
    new_tags = []
    msg_normalized = _normalize(message)

    for rule in rules:
        tag = rule["tag"]
        patterns = rule.get("patterns") or []
        match_type = rule.get("match_type", "keyword")
        match_field = rule.get("match_field", "message")
        apply_once = rule.get("apply_once", False)

        # Se apply_once e já tem a tag, pular
        if apply_once and tag in current:
            continue

        # Selecionar o texto a verificar
        if match_field == "message":
            text_to_check = message
            text_normalized = msg_normalized
        elif match_field == "username":
            text_to_check = sender_username or ""
            text_normalized = _normalize(text_to_check)
        elif match_field == "first_name":
            text_to_check = sender_name or ""
            text_normalized = _normalize(text_to_check)
        else:
            text_to_check = message
            text_normalized = msg_normalized

        if not text_to_check:
            continue

        # Verificar match
        matched = False
        if match_type == "keyword":
            matched = _match_keyword(text_normalized, patterns)
        elif match_type == "regex":
            matched = _match_regex(text_to_check, patterns)
        elif match_type == "ai":
            # Placeholder para futura implementação com IA
            log.debug(f"Match type 'ai' não implementado — rule {rule['id']}")
            continue

        if matched:
            new_tags.append(tag)
            current.add(tag)
            log.info(
                f"Auto-tag match | contact={contact_id[:8]}... | "
                f"rule={rule['name']} | tag={tag} | type={match_type}"
            )

    # Aplicar tags no banco (em batch)
    if new_tags:
        add_tags_to_contact(contact_id, new_tags)
        log.info(f"Auto-tags aplicadas | contact={contact_id[:8]}... | tags={new_tags}")

    return new_tags
