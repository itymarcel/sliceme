import os
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

CREATE_USAGE_SESSIONS_SQL = """
CREATE TABLE IF NOT EXISTS usage_sessions (
    id uuid PRIMARY KEY,
    started_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    ended_at timestamptz,
    active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
    heartbeat_count integer NOT NULL DEFAULT 0 CHECK (heartbeat_count >= 0),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
)
"""


def update_session_sql() -> str:
    return """
    INSERT INTO usage_sessions (id, started_at, last_seen_at, active_seconds, heartbeat_count, ended_at)
    VALUES (%(session_id)s, %(now)s, %(now)s, %(active_seconds)s, 1, %(ended_at)s)
    ON CONFLICT (id) DO UPDATE SET
        last_seen_at = EXCLUDED.last_seen_at,
        active_seconds = GREATEST(active_seconds, EXCLUDED.active_seconds),
        heartbeat_count = usage_sessions.heartbeat_count + 1,
        ended_at = EXCLUDED.ended_at
    """


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _connect():
    if not DATABASE_URL:
        return None
    import psycopg
    return psycopg.connect(DATABASE_URL)


def init_usage_db() -> None:
    if not DATABASE_URL:
        return
    with _connect() as connection:
        connection.execute(CREATE_USAGE_SESSIONS_SQL)
        connection.commit()


def _write_session(session_id: UUID, active_seconds: int, ended: bool = False) -> None:
    if not DATABASE_URL:
        return
    now = _now()
    with _connect() as connection:
        connection.execute(
            update_session_sql(),
            {
                "session_id": session_id,
                "now": now,
                "active_seconds": active_seconds,
                "ended_at": now if ended else None,
            },
        )
        connection.commit()


def start_session(session_id: UUID) -> None:
    if not DATABASE_URL:
        return
    now = _now()
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO usage_sessions (id, started_at, last_seen_at)
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (session_id, now, now),
        )
        connection.commit()


def heartbeat_session(session_id: UUID, active_seconds: int) -> None:
    _write_session(session_id, active_seconds)


def end_session(session_id: UUID, active_seconds: int) -> None:
    _write_session(session_id, active_seconds, ended=True)


def list_sessions(limit: int = 100) -> list[dict[str, Any]]:
    if not DATABASE_URL:
        return []
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, started_at, last_seen_at, ended_at, active_seconds, heartbeat_count
            FROM usage_sessions ORDER BY started_at DESC LIMIT %s
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "id": str(row[0]),
            "started_at": row[1].isoformat(),
            "last_seen_at": row[2].isoformat(),
            "ended_at": row[3].isoformat() if row[3] else None,
            "active_seconds": row[4],
            "heartbeat_count": row[5],
        }
        for row in rows
    ]
