#!/usr/bin/env python3
"""
CLI para gerenciar migrations e schema do banco.

Uso:
    python manage.py migrate          # Executa migrations pendentes
    python manage.py status           # Mostra status das migrations
    python manage.py generate <nome>  # Gera arquivo de migration vazio
    python manage.py schema           # Imprime DDL completo gerado do schema.py
    python manage.py schema --save    # Salva schema.sql gerado do schema.py
    python manage.py diff             # Mostra diferenças entre schema.py e o banco atual
"""

import os
import sys
import argparse
from dotenv import load_dotenv

load_dotenv()

from logger import get_logger

log = get_logger("manage")


def cmd_migrate(args):
    """Executa migrations pendentes."""
    from database import run_migrations_on_startup

    try:
        result = run_migrations_on_startup()
        executed = result.get("executed", [])
        skipped = result.get("skipped", [])

        if not executed:
            print("✓ Banco já está atualizado. Nenhuma migration pendente.")
        else:
            print(f"✓ {len(executed)} migration(s) executada(s):")
            for m in executed:
                print(f"  → {m['name']} ({m['duration_ms']}ms)")

    except RuntimeError as e:
        print(f"✗ Erro: {e}", file=sys.stderr)
        sys.exit(1)


def cmd_status(args):
    """Mostra status de todas as migrations."""
    from database import get_raw_connection
    from db.migrate import get_migration_files, get_executed_migrations, MIGRATIONS_TABLE_SQL

    conn = get_raw_connection()
    cur = conn.cursor()

    # Garantir que tabela existe
    cur.execute(MIGRATIONS_TABLE_SQL)
    conn.commit()
    cur.close()

    # Listar executadas
    executed = get_executed_migrations(conn)
    files = get_migration_files()
    conn.close()

    print(f"\n{'Nome':<45} {'Status':<15} {'Checksum':<18}")
    print("─" * 80)

    for f in files:
        name = f["name"]
        checksum = f["checksum"]

        if name in executed:
            if executed[name] == checksum:
                status = "✓ executada"
            else:
                status = "⚠ modificada!"
        else:
            status = "⏳ pendente"

        print(f"{name:<45} {status:<15} {checksum:<18}")

    # Migrations no banco que não existem no disco
    for name in executed:
        if not any(f["name"] == name for f in files):
            print(f"{name:<45} {'🗑 removida do disco':<15} {executed[name]:<18}")

    pending = sum(1 for f in files if f["name"] not in executed)
    print(f"\nTotal: {len(files)} no disco | {len(executed)} executadas | {pending} pendente(s)\n")


def cmd_generate(args):
    """Gera um novo arquivo de migration."""
    from db.migrate import generate_migration_file

    name = args.name.replace(" ", "_").lower()

    # Se --sql fornecido, usar como conteúdo
    if args.sql:
        sql = args.sql
    else:
        sql = f"-- Escreva o SQL da migration aqui\n\n"

    filepath = generate_migration_file(name, sql)
    print(f"✓ Migration criada: {filepath}")
    print(f"  Edite o arquivo e execute: python manage.py migrate")


def cmd_schema(args):
    """Gera DDL completo a partir de db/schema.py."""
    from db.schema import generate_full_schema

    ddl = generate_full_schema()

    if args.save:
        outpath = os.path.join(os.path.dirname(__file__), "schema_generated.sql")
        with open(outpath, "w", encoding="utf-8") as f:
            f.write(ddl)
        print(f"✓ Schema salvo em: {outpath}")
    else:
        print(ddl)


def cmd_diff(args):
    """Compara schema.py com o estado atual do banco."""
    from database import get_raw_connection
    from db.schema import TABLES

    conn = get_raw_connection()
    cur = conn.cursor()

    print("\n=== Diferenças entre schema.py e banco ===\n")

    for table in TABLES:
        # Verificar se tabela existe
        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = %s)",
            (table.name,),
        )
        exists = cur.fetchone()[0]

        if not exists:
            print(f"  ✗ Tabela '{table.name}' não existe no banco (precisa de migration)")
            continue

        # Verificar colunas
        cur.execute(
            "SELECT column_name, data_type, character_maximum_length, is_nullable, column_default "
            "FROM information_schema.columns WHERE table_name = %s ORDER BY ordinal_position",
            (table.name,),
        )
        db_columns = {row[0]: row for row in cur.fetchall()}
        schema_columns = {col.name: col for col in table.columns}

        missing_in_db = set(schema_columns.keys()) - set(db_columns.keys())
        extra_in_db = set(db_columns.keys()) - set(schema_columns.keys())

        if missing_in_db:
            for col_name in missing_in_db:
                col = schema_columns[col_name]
                print(f"  + {table.name}.{col_name} ({col.type}) — falta no banco")

        if extra_in_db:
            for col_name in extra_in_db:
                print(f"  - {table.name}.{col_name} — existe no banco mas não no schema.py")

        if not missing_in_db and not extra_in_db:
            print(f"  ✓ {table.name} — OK")

    cur.close()
    conn.close()
    print()


def main():
    parser = argparse.ArgumentParser(
        description="BotFans — Gerenciador de migrations e schema",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exemplos:
  python manage.py migrate                    # Executa pendentes
  python manage.py status                     # Mostra status
  python manage.py generate add_user_email    # Gera migration vazia
  python manage.py schema                     # Imprime DDL
  python manage.py schema --save              # Salva schema_generated.sql
  python manage.py diff                       # Compara schema.py vs banco
        """,
    )

    subparsers = parser.add_subparsers(dest="command", help="Comando")

    # migrate
    subparsers.add_parser("migrate", help="Executar migrations pendentes")

    # status
    subparsers.add_parser("status", help="Mostrar status das migrations")

    # generate
    gen_parser = subparsers.add_parser("generate", help="Gerar novo arquivo de migration")
    gen_parser.add_argument("name", help="Nome descritivo (ex: add_user_email)")
    gen_parser.add_argument("--sql", help="SQL da migration (opcional)", default=None)

    # schema
    schema_parser = subparsers.add_parser("schema", help="Gerar DDL do schema.py")
    schema_parser.add_argument("--save", action="store_true", help="Salvar em schema_generated.sql")

    # diff
    subparsers.add_parser("diff", help="Comparar schema.py com o banco atual")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    commands = {
        "migrate": cmd_migrate,
        "status": cmd_status,
        "generate": cmd_generate,
        "schema": cmd_schema,
        "diff": cmd_diff,
    }

    commands[args.command](args)


if __name__ == "__main__":
    main()
