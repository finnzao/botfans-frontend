import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler

LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG").upper()
LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
IS_DEV = os.getenv("NODE_ENV", "development") != "production"

# Criar diretório de logs se não existir
os.makedirs(LOG_DIR, exist_ok=True)

# Arquivo de log com data
LOG_FILE = os.path.join(LOG_DIR, f"worker_{datetime.now().strftime('%Y-%m-%d')}.log")

# Formatters
CONSOLE_FMT = logging.Formatter(
    "[%(asctime)s] [%(levelname)-5s] [%(name)-20s] %(message)s",
    datefmt="%H:%M:%S",
)

FILE_FMT = logging.Formatter(
    "[%(asctime)s] [%(levelname)-5s] [%(name)-20s] [%(funcName)s:%(lineno)d] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

# Handler de arquivo compartilhado (5MB por arquivo, 5 backups)
_file_handler = None


def _get_file_handler() -> RotatingFileHandler:
    global _file_handler
    if _file_handler is None:
        _file_handler = RotatingFileHandler(
            LOG_FILE,
            maxBytes=5 * 1024 * 1024,  # 5MB
            backupCount=5,
            encoding="utf-8",
        )
        _file_handler.setFormatter(FILE_FMT)
        _file_handler.setLevel(logging.DEBUG)  # Arquivo sempre grava tudo
    return _file_handler


# Chaves sensíveis que devem ser mascaradas nos logs
SENSITIVE_KEYS = [
    "apiHash", "api_hash", "api_hash_encrypted", "stelToken",
    "password", "password2fa", "code", "random_hash", "randomHash",
    "session_string",
]


def mask_sensitive(data: dict, keys: list[str] = None) -> dict:
    """Mascara valores sensíveis em um dicionário para log seguro."""
    if keys is None:
        keys = SENSITIVE_KEYS
    masked = {}
    for k, v in data.items():
        if k in keys and isinstance(v, str):
            if len(v) <= 4:
                masked[k] = "****"
            else:
                masked[k] = v[:3] + "***" + v[-2:]
        elif isinstance(v, dict):
            masked[k] = mask_sensitive(v, keys)
        else:
            masked[k] = v
    return masked


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)

    if not logger.handlers:
        # Console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setFormatter(CONSOLE_FMT)
        console_handler.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
        logger.addHandler(console_handler)

        # File handler (sempre ativo em dev)
        if IS_DEV:
            logger.addHandler(_get_file_handler())

    logger.setLevel(logging.DEBUG)  # Logger aceita tudo, handlers filtram
    logger.propagate = False
    return logger


def log_separator(logger: logging.Logger, title: str = ""):
    """Imprime um separador visual no log."""
    line = "=" * 60
    if title:
        logger.info(line)
        logger.info(f"  {title}")
        logger.info(line)
    else:
        logger.info(line)
