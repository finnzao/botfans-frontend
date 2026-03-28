# BotFans Telegram Worker

Worker Python que gerencia sessões Telethon, escuta mensagens e responde automaticamente.

## Arquitetura

```
┌──────────────┐       Redis PubSub       ┌──────────────────┐
│  Next.js API │  ──────────────────────→  │  Python Worker   │
│  (frontend)  │  telegram:start_session   │  (main.py)       │
└──────────────┘                           └────────┬─────────┘
                                                    │
                                           ┌────────▼─────────┐
                                           │  session_manager  │
                                           │  (Telethon)       │
                                           └────────┬─────────┘
                                                    │
                                           ┌────────▼─────────┐
                                           │  Telegram API     │
                                           │  (MTProto)        │
                                           └──────────────────┘
```

## Fluxo

1. Frontend envia número → backend faz login em my.telegram.org → captura api_id/api_hash
2. Backend publica `telegram:start_session` no Redis com as credenciais
3. **Worker** recebe, cria TelegramClient, envia código de verificação
4. Usuário digita código → backend publica `verify_code` → worker autentica
5. Worker registra handler de mensagens (watch mode)
6. Cada mensagem privada recebida: salva contato, salva mensagem, gera resposta, envia

## Setup

```bash
# 1. Instalar dependências
cd worker
pip install -r requirements.txt

# 2. Configurar banco (executar uma vez)
psql -U botfans -d botfans -f schema.sql

# 3. Copiar e editar .env
cp .env.example .env

# 4. Rodar
python main.py
```

## Arquivos

| Arquivo             | Função                                                    |
|---------------------|-----------------------------------------------------------|
| `main.py`           | Entry point — escuta Redis e despacha para handlers       |
| `session_manager.py`| Gerencia clientes Telethon, auth, e handlers de mensagem  |
| `database.py`       | CRUD no PostgreSQL (sessões, contatos, mensagens)         |
| `logger.py`         | Logger formatado                                          |
| `schema.sql`        | DDL do banco de dados                                     |

## Sessões

Os arquivos `.session` do Telethon ficam em `./sessions/`.
Cada sessão é nomeada pelo `session_id` (UUID) do banco.
Quando o worker reinicia, ele restaura automaticamente todas as sessões com status `active`.

## Enviar mensagem manualmente

```python
from session_manager import send_message

# session_id da tabela telegram_sessions
# user_id do Telegram (telegram_user_id da tabela contacts)
await send_message("d2bcee39-...", 123456789, "Olá! Tudo bem?")
```
