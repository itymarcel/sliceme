import logging
import os
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
logger = logging.getLogger("standalone-slicer.usage")

CREATE_USAGE_SQL = """
CREATE TABLE IF NOT EXISTS usage_sessions (
    id uuid PRIMARY KEY,
    started_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    ended_at timestamptz,
    active_seconds integer NOT NULL DEFAULT 0 CHECK (active_seconds >= 0),
    heartbeat_count integer NOT NULL DEFAULT 0 CHECK (heartbeat_count >= 0),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS usage_events (
    id bigserial PRIMARY KEY,
    session_id uuid REFERENCES usage_sessions(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    success boolean,
    reason text,
    occurred_at timestamptz NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS usage_events_type_time_idx ON usage_events (event_type, occurred_at DESC);
"""


def update_session_sql() -> str:
    return """
    INSERT INTO usage_sessions (id, started_at, last_seen_at, active_seconds, heartbeat_count, ended_at)
    VALUES (%(session_id)s, %(now)s, %(now)s, %(active_seconds)s, 1, %(ended_at)s)
    ON CONFLICT (id) DO UPDATE SET
        last_seen_at = EXCLUDED.last_seen_at,
        active_seconds = GREATEST(usage_sessions.active_seconds, EXCLUDED.active_seconds),
        heartbeat_count = usage_sessions.heartbeat_count + 1,
        ended_at = EXCLUDED.ended_at
    """


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _connect():
    if not DATABASE_URL:
        return None
    import psycopg
    return psycopg.connect(DATABASE_URL, connect_timeout=5)


def init_usage_db() -> None:
    if not DATABASE_URL:
        return
    try:
        with _connect() as connection:
            for statement in CREATE_USAGE_SQL.split(";"):
                if statement.strip():
                    connection.execute(statement)
            connection.commit()
    except Exception:
        logger.exception("Usage database initialization failed; continuing without usage storage")


def _write_session(session_id: UUID, active_seconds: int, ended: bool = False) -> None:
    if not DATABASE_URL:
        return
    now = _now()
    try:
        with _connect() as connection:
            connection.execute(update_session_sql(), {
                "session_id": session_id,
                "now": now,
                "active_seconds": active_seconds,
                "ended_at": now if ended else None,
            })
            connection.commit()
    except Exception:
        logger.exception("Usage session update failed")


def start_session(session_id: UUID) -> None:
    if not DATABASE_URL:
        return
    now = _now()
    try:
        with _connect() as connection:
            connection.execute(
                "INSERT INTO usage_sessions (id, started_at, last_seen_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                (session_id, now, now),
            )
            connection.commit()
    except Exception:
        logger.exception("Usage session start failed")


def heartbeat_session(session_id: UUID, active_seconds: int) -> None:
    _write_session(session_id, active_seconds)


def end_session(session_id: UUID, active_seconds: int) -> None:
    _write_session(session_id, active_seconds, ended=True)


def record_event(session_id: UUID, event_type: str, success: bool | None = None, reason: str | None = None) -> None:
    if not DATABASE_URL:
        return
    try:
        with _connect() as connection:
            now = _now()
            connection.execute(
                "INSERT INTO usage_sessions (id, started_at, last_seen_at) VALUES (%s, %s, %s) ON CONFLICT (id) DO NOTHING",
                (session_id, now, now),
            )
            connection.execute(
                "INSERT INTO usage_events (session_id, event_type, success, reason, occurred_at) VALUES (%s, %s, %s, %s, %s)",
                (session_id, event_type, success, reason[:500] if reason else None, now),
            )
            connection.commit()
    except Exception:
        logger.exception("Usage event recording failed")


def list_sessions(limit: int = 100) -> list[dict[str, Any]]:
    if not DATABASE_URL:
        return []
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT s.id, s.started_at, s.last_seen_at, s.ended_at, s.active_seconds, s.heartbeat_count,
              COUNT(e.id) FILTER (WHERE e.event_type = 'slice_triggered') AS slices_triggered,
              COUNT(e.id) FILTER (WHERE e.event_type = 'slice_succeeded') AS slices_succeeded,
              COUNT(e.id) FILTER (WHERE e.event_type = 'slice_failed') AS slices_failed,
              COALESCE(json_agg(json_build_object('timestamp', e.occurred_at, 'reason', COALESCE(e.reason, 'Unknown error')) ORDER BY e.occurred_at DESC) FILTER (WHERE e.event_type = 'slice_failed'), '[]'::json) AS failed_slices
            FROM usage_sessions s LEFT JOIN usage_events e ON e.session_id = s.id
            GROUP BY s.id ORDER BY s.started_at DESC LIMIT %s
            """,
            (limit,),
        ).fetchall()
    return [
        {
            "id": str(row[0]), "started_at": row[1].isoformat(), "last_seen_at": row[2].isoformat(),
            "ended_at": row[3].isoformat() if row[3] else None, "active_seconds": row[4],
            "heartbeat_count": row[5], "slices_triggered": row[6], "slices_succeeded": row[7], "slices_failed": row[8],
            "failed_slices": row[9],
        }
        for row in rows
    ]


def usage_summary() -> dict[str, Any]:
    if not DATABASE_URL:
        return {"slices_triggered": 0, "slices_succeeded": 0, "slices_failed": 0, "failure_reasons": []}
    with _connect() as connection:
        totals = connection.execute(
            """SELECT COUNT(*) FILTER (WHERE event_type = 'slice_triggered'),
                      COUNT(*) FILTER (WHERE event_type = 'slice_succeeded'),
                      COUNT(*) FILTER (WHERE event_type = 'slice_failed')
               FROM usage_events""",
        ).fetchone()
        reasons = connection.execute(
            """SELECT COALESCE(reason, 'Unknown error'), COUNT(*) FROM usage_events
               WHERE event_type = 'slice_failed' GROUP BY reason ORDER BY COUNT(*) DESC""",
        ).fetchall()
    return {
        "slices_triggered": totals[0], "slices_succeeded": totals[1], "slices_failed": totals[2],
        "failure_reasons": [{"reason": row[0], "count": row[1]} for row in reasons],
    }
