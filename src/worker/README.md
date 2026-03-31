# BotFans Telegram Worker (v2)

Worker Python que gerencia sessões Telethon, escuta mensagens e responde automaticamente.

## Mudanças na v2

### Persistência de Sessão
- **StringSession salva no banco**: A session string do Telethon é salva em `telegram_sessions.session_string`
- **Salvamento periódico**: A cada 5 minutos, a session string é re-salva (captura rotações de auth key)
- **Salvamento pré-auth**: A session string é salva antes mesmo da autenticação completa
- **Salvamento no shutdown**: Antes de desconectar, a session string é salva
- **Restauração automática**: Ao reiniciar, o worker restaura todas as sessões ativas do banco

### Logging Melhorado (Dev Mode)
- **Arquivo de log**: `logs/worker_YYYY-MM-DD.log` com rotating (5MB, 5 backups)
- **Logs detalhados**: Cada função loga entrada, saída, tempo de execução e erros
- **Mascaramento**: Dados sensíveis (api_hash, session_string, senhas) são mascarados
- **Separadores visuais**: Operações importantes têm separadores `====` para fácil leitura
- **Diagnósticos**: A cada 5 minutos, loga status de todas as sessões ativas

### Watch Mode
- **Histórico de conversa**: Busca as últimas 10 mensagens do contato para contexto
- **Delay anti-detecção**: Espera 1-3s antes de responder (parece mais natural)
- **Logs por mensagem**: Cada mensagem recebida/enviada é logada com preview e tempo

### Resiliência
- **Connection pooling**: PostgreSQL usa pool de conexões (min=1, max=5)
- **Locks por sessão**: Operações concorrentes na mesma sessão são serializadas
- **Shutdown graceful**: SIGINT/SIGTERM desconectam todas as sessões antes de sair
- **Retry no Redis**: Backoff exponencial em caso de desconexão

## Setup

```bash
# 1. Instalar dependências
cd src/worker
pip install -r requirements.txt

# 2. Executar migration
psql -U botfans -d botfans -f migration_session_improvements.sql

# 3. Configurar .env
cp .env.example .env

# 4. Rodar
python main.py
```

## Estrutura

```
worker/
├── main.py                          # Entry point — fila Redis + dispatch
├── session_manager.py               # Gerencia Telethon (auth, watch mode)
├── database.py                      # CRUD PostgreSQL (pool de conexões)
├── logger.py                        # Logger com arquivo + console
├── requirements.txt                 # Dependências Python
├── schema.sql                       # DDL original do banco
├── migration_session_improvements.sql  # Migration v2
├── .env.example                     # Template de variáveis
├── .gitignore                       # Ignora logs, .env, __pycache__
└── logs/                            # Arquivos de log (auto-criado)
    └── worker_2025-01-15.log
```

## Fluxo de Autenticação

```
1. Frontend envia phone
   └→ Backend POST my.telegram.org/auth/send_password
   └→ Backend salva flow no Redis

2. Usuário digita código do portal
   └→ Backend POST my.telegram.org/auth/login
   └→ Backend captura api_id + api_hash
   └→ Backend publica telegram:start_session no Redis

3. Worker recebe task
   └→ session_manager.start_session()
   └→ Cria TelegramClient(StringSession)
   └→ client.send_code_request(phone)
   └→ Salva session_string no banco (pré-auth!)
   └→ Atualiza flow → awaiting_session_code

4. Usuário digita código do Telegram (5 dígitos)
   └→ Backend publica verify_code no Redis
   └→ Worker: session_manager.verify_code()
   └→ client.sign_in(phone, code)
   └→ Se 2FA: retorna awaiting_2fa
   └→ Se OK: salva session_string, registra watch mode
   └→ Inicia periodic_session_saver (5min)

5. Watch mode ativo
   └→ Mensagem privada recebida
   └→ save_contact() → save_message(incoming)
   └→ get_conversation_history() (últimas 10)
   └→ generate_response() → delay 1-3s
   └→ event.respond() → save_message(outgoing)
```

## Logs

Em modo dev, tudo é salvo em `logs/worker_YYYY-MM-DD.log`:

```
[2025-01-15T10:30:00] [INFO ] [worker              ] ============================================================
[2025-01-15T10:30:00] [INFO ] [worker              ]   BotFans Telegram Worker
[2025-01-15T10:30:00] [INFO ] [session_manager     ] ✓ Watch mode ATIVO! | logado_como=João (@joao) | user_id=12345
[2025-01-15T10:30:15] [INFO ] [session_manager     ] 📩 MENSAGEM RECEBIDA | from=Maria (@maria) | len=12 | preview="Oi, tudo bem?"
[2025-01-15T10:30:17] [INFO ] [session_manager     ] 📤 RESPOSTA ENVIADA | to=Maria (@maria) | len=45 | elapsed=2100ms
```
