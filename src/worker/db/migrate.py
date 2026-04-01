"""
Migration Runner — executa migrations pendentes automaticamente.
"""

import os
import hashlib
import time
from pathlib import Path
from logger import get_logger

log = get_logger("migrations")

MIGRATIONS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "migrations")

MIGRATIONS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS _migrations (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL UNIQUE,
    checksum    VARCHAR(64) NOT NULL,
    executed_at TIMESTAMP DEFAULT NOW(),
    duration_ms INTEGER
);
"""


def get_migration_files() -> list[dict]:
    migrations_path = Path(MIGRATIONS_DIR)
    if not migrations_path.exists():
        log.warning(f"Diretório de migrations não existe: {MIGRATIONS_DIR}")
        os.makedirs(MIGRATIONS_DIR, exist_ok=True)
        return []

    files = sorted(migrations_path.glob("*.sql"))
    result = []

    for f in files:
        content = f.read_text(encoding="utf-8")
        checksum = hashlib.sha256(content.encode()).hexdigest()[:16]
        result.append({
            "name": f.name,
            "path": str(f),
            "content": content,
            "checksum": checksum,
        })

    return result


def get_executed_migrations(conn) -> dict[str, str]:
    cur = conn.cursor()
    cur.execute("SELECT name, checksum FROM _migrations ORDER BY id")
    rows = cur.fetchall()
    cur.close()
    return {row[0]: row[1] for row in rows}


def run_migrations(conn) -> dict:
    log.info("=" * 50)
    log.info("  MIGRATION RUNNER")
    log.info("=" * 50)

    result = {"executed": [], "skipped": [], "errors": []}

    cur = conn.cursor()
    cur.execute(MIGRATIONS_TABLE_SQL)
    conn.commit()
    cur.close()

    migration_files = get_migration_files()
    if not migration_files:
        log.info("Nenhuma migration encontrada no disco")
        return result

    log.info(f"Migrations no disco: {len(migration_files)}")

    executed = get_executed_migrations(conn)
    log.info(f"Migrations já executadas: {len(executed)}")

    for mig in migration_files:
        name = mig["name"]
        checksum = mig["checksum"]

        if name in executed:
            if executed[name] != checksum:
                log.warning(f"⚠ Migration '{name}' foi modificada após execução!")
                result["skipped"].append({"name": name, "reason": "already_executed_but_modified"})
            else:
                log.debug(f"  ✓ {name} — já executada")
                result["skipped"].append({"name": name, "reason": "already_executed"})
            continue

        log.info(f"  ▶ Executando: {name} (checksum={checksum})")
        start = time.perf_counter()

        try:
            cur = conn.cursor()
            cur.execute(mig["content"])

            duration_ms = int((time.perf_counter() - start) * 1000)

            cur.execute(
                "INSERT INTO _migrations (name, checksum, duration_ms) VALUES (%s, %s, %s)",
                (name, checksum, duration_ms),
            )
            conn.commit()
            cur.close()

            log.info(f"  ✓ {name} — OK ({duration_ms}ms)")
            result["executed"].append({"name": name, "duration_ms": duration_ms})

        except Exception as e:
            conn.rollback()
            log.error(f"  ✗ {name} — FALHOU: {e}")
            result["errors"].append({"name": name, "error": str(e)})
            break

    log.info(
        f"Migration concluída | executadas={len(result['executed'])} | "
        f"puladas={len(result['skipped'])} | erros={len(result['errors'])}"
    )

    return result


def generate_migration_file(name: str, sql: str) -> str:
    existing = sorted(Path(MIGRATIONS_DIR).glob("*.sql")) if Path(MIGRATIONS_DIR).exists() else []
    next_num = 1
    if existing:
        try:
            last_name = existing[-1].name
            next_num = int(last_name.split("_")[0]) + 1
        except (ValueError, IndexError):
            next_num = len(existing) + 1

    filename = f"{next_num:03d}_{name}.sql"
    filepath = os.path.join(MIGRATIONS_DIR, filename)

    os.makedirs(MIGRATIONS_DIR, exist_ok=True)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(f"-- Migration: {name}\n")
        f.write(f"-- Auto-generated\n\n")
        f.write(sql)

    log.info(f"Migration gerada: {filepath}")
    return filepath
