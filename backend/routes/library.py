"""AI Agent 圖書館 — system categories + RAG knowledge entries.

New tables (added per spec extension, not part of the original v1.2 schema):

  budget.rag_systems   — the system categories shown as cards on the library page
  budget.rag_entries   — knowledge / rule entries that experts fill in per system
"""

from flask import Blueprint, request, jsonify
from db import cursor as db_cursor, row_to_dict
from routes.auth import require_auth, current_user

library_bp = Blueprint("library", __name__)

DISPOSITIONS = ("通過", "退件", "不適用")
ENTRY_CATEGORIES = ("歷史資料", "料單", "外部資料", "其他", "待定")

# Official system seed — 18 entries across 4 categories
LIBRARY_SEED = [
    ("設備擴充 (UTI)",  "空調",      "黃金燦",                 1),
    ("設備擴充 (UTI)",  "空壓",      "郭于斌",                 2),
    ("設備擴充 (UTI)",  "水務",      "梁益齊",                 3),
    ("設備擴充 (UTI)",  "抽氣",      "梁益齊",                 4),
    ("設備擴充 (UTI)",  "電力",      "李明鴻",                 5),
    ("工程擴廠 (新工)", "二次配",    "陳信舟、鄭仁勝、紀志忠",  6),
    ("工程擴廠 (新工)", "Relayout",  "陳信舟、鄭仁勝、紀志忠",  7),
    ("工程擴廠 (新工)", "空調",      "鄭仁勝",                 8),
    ("工程擴廠 (新工)", "空壓",      "鄭仁勝",                 9),
    ("工程擴廠 (新工)", "水務",      "陳妍方",                 10),
    ("工程擴廠 (新工)", "抽氣",      "陳妍方",                 11),
    ("工程擴廠 (新工)", "電力",      "鄭仁勝",                 12),
    ("CIM相關",         "監控",      "王嘉漢",                 13),
    ("CIM相關",         "AI自動化",  "黃互慶",                 14),
    ("法遵 (ESH)",      "消防",      "吳明華",                 15),
    ("法遵 (ESH)",      "建管",      "吳明華",                 16),
    ("法遵 (ESH)",      "環保",      "姜婷毓",                 17),
    ("法遵 (ESH)",      "安全",      "楊小惠",                 18),
]

# Old placeholder patterns to detect and replace
_SEED_5_WRONG = {"歷史資料", "料單", "外部資料", "其他", "待定"}


def _is_placeholder(name: str) -> bool:
    """True if a system name is an auto-generated placeholder."""
    return name.startswith("系統 ") or name in _SEED_5_WRONG


def _do_seed(cur):
    """Insert all LIBRARY_SEED rows. Caller must commit."""
    for cat, name, experts, sort in LIBRARY_SEED:
        cur.execute(
            """INSERT INTO budget.rag_systems (category, name, expert_name, sort_order)
               VALUES (%s, %s, %s, %s)""",
            (cat, name, experts, sort),
        )


# ── Schema bootstrap ──────────────────────────────────────────────────
def init_library_schema():
    """Create the RAG tables if they don't exist and seed with real system names."""
    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS budget.rag_systems (
                    id          SERIAL PRIMARY KEY,
                    category    VARCHAR,
                    name        VARCHAR NOT NULL,
                    description TEXT,
                    expert_name VARCHAR,
                    sort_order  INT DEFAULT 0,
                    created_at  TIMESTAMP DEFAULT NOW()
                );
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS budget.rag_entries (
                    id             SERIAL PRIMARY KEY,
                    system_id      INT NOT NULL REFERENCES budget.rag_systems(id) ON DELETE CASCADE,
                    title          VARCHAR NOT NULL,
                    keywords       TEXT,
                    content        TEXT,
                    example        TEXT,
                    disposition    VARCHAR,
                    note           TEXT,
                    created_by     VARCHAR,
                    created_at     TIMESTAMP DEFAULT NOW(),
                    updated_at     TIMESTAMP DEFAULT NOW()
                );
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_rag_entries_system ON budget.rag_entries(system_id);"
            )
            # Idempotent column migrations
            cur.execute("ALTER TABLE budget.rag_systems ADD COLUMN IF NOT EXISTS category VARCHAR;")
            cur.execute("ALTER TABLE budget.rag_systems ADD COLUMN IF NOT EXISTS expert_name VARCHAR;")
            cur.execute("ALTER TABLE budget.rag_entries ADD COLUMN IF NOT EXISTS entry_category VARCHAR DEFAULT '其他';")

            # ── Seeding logic ──────────────────────────────────────────
            cur.execute("SELECT COUNT(*) AS n FROM budget.rag_systems")
            total = cur.fetchone()["n"]
            cur.execute("SELECT COUNT(*) AS n FROM budget.rag_entries")
            has_entries = cur.fetchone()["n"] > 0

            if total == 0:
                _do_seed(cur)
            elif not has_entries:
                cur.execute("SELECT name FROM budget.rag_systems")
                existing = {r["name"] for r in cur.fetchall()}
                if all(_is_placeholder(n) for n in existing):
                    cur.execute("DELETE FROM budget.rag_systems")
                    _do_seed(cur)
    except Exception as e:
        print(f"[library] schema init skipped: {e}")


# ── Systems ───────────────────────────────────────────────────────────
@library_bp.get("/rag/systems")
@require_auth
def list_systems():
    try:
        with db_cursor() as cur:
            cur.execute(
                """
                SELECT s.*,
                       COALESCE(c.cnt, 0) AS entry_count
                FROM budget.rag_systems s
                LEFT JOIN (
                    SELECT system_id, COUNT(*) AS cnt
                    FROM budget.rag_entries
                    GROUP BY system_id
                ) c ON c.system_id = s.id
                ORDER BY s.sort_order, s.id
                """
            )
            rows = [row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(systems=rows)


@library_bp.post("/rag/systems")
@require_auth
def create_system():
    caller = current_user()
    if caller.get("role") != "admin":
        return jsonify(error="僅系統管理員可新增系統類別"), 403

    data        = request.json or {}
    name        = (data.get("name")        or "").strip()
    desc        = (data.get("description") or "").strip() or None
    expert_name = (data.get("expert_name") or "").strip() or None
    category    = (data.get("category")    or "").strip() or None
    if not name:
        return jsonify(error="系統名稱為必填"), 400

    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                "SELECT COALESCE(MAX(sort_order), 0) + 1 AS nxt FROM budget.rag_systems"
            )
            nxt = cur.fetchone()["nxt"]
            cur.execute(
                """INSERT INTO budget.rag_systems (category, name, description, expert_name, sort_order)
                   VALUES (%s, %s, %s, %s, %s) RETURNING *""",
                (category, name, desc, expert_name, nxt),
            )
            row = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500
    row["entry_count"] = 0
    return jsonify(system=row), 201


@library_bp.put("/rag/systems/<int:sys_id>")
@require_auth
def update_system(sys_id):
    caller = current_user()
    if caller.get("role") != "admin":
        return jsonify(error="僅系統管理員可修改系統類別"), 403

    data        = request.json or {}
    name        = (data.get("name")        or "").strip()
    desc        = (data.get("description") or "").strip() or None
    expert_name = (data.get("expert_name") or "").strip() or None
    category    = (data.get("category")    or "").strip() or None
    if not name:
        return jsonify(error="系統名稱為必填"), 400

    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """UPDATE budget.rag_systems
                   SET category = %s, name = %s, description = %s, expert_name = %s
                   WHERE id = %s RETURNING *""",
                (category, name, desc, expert_name, sys_id),
            )
            row = cur.fetchone()
            if not row:
                return jsonify(error="系統類別不存在"), 404
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(system=row_to_dict(row))


@library_bp.delete("/rag/systems/<int:sys_id>")
@require_auth
def delete_system(sys_id):
    caller = current_user()
    if caller.get("role") != "admin":
        return jsonify(error="僅系統管理員可刪除系統類別"), 403
    try:
        with db_cursor(commit=True) as cur:
            cur.execute("DELETE FROM budget.rag_systems WHERE id = %s", (sys_id,))
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(ok=True)


@library_bp.post("/rag/systems/reseed")
@require_auth
def reseed_systems():
    """Admin: replace all placeholder systems (0 entries, auto-named) with LIBRARY_SEED."""
    caller = current_user()
    if caller.get("role") != "admin":
        return jsonify(error="僅系統管理員可執行重設"), 403

    try:
        with db_cursor(commit=True) as cur:
            # Find placeholders with no entries
            cur.execute(
                """
                SELECT s.id, s.name
                FROM budget.rag_systems s
                LEFT JOIN budget.rag_entries e ON e.system_id = s.id
                GROUP BY s.id, s.name
                HAVING COUNT(e.id) = 0
                """
            )
            empty_ids = [r["id"] for r in cur.fetchall() if _is_placeholder(r["name"])]
            deleted = len(empty_ids)

            if empty_ids:
                cur.execute(
                    "DELETE FROM budget.rag_systems WHERE id = ANY(%s)", (empty_ids,)
                )

            # Insert any LIBRARY_SEED entries not already present (match by category+name)
            cur.execute("SELECT category, name FROM budget.rag_systems")
            existing = {(r["category"], r["name"]) for r in cur.fetchall()}
            added = 0
            for cat, name, experts, sort in LIBRARY_SEED:
                if (cat, name) not in existing:
                    cur.execute(
                        """INSERT INTO budget.rag_systems (category, name, expert_name, sort_order)
                           VALUES (%s, %s, %s, %s)""",
                        (cat, name, experts, sort),
                    )
                    added += 1
    except Exception as e:
        return jsonify(error=str(e)), 500

    return jsonify(ok=True, deleted=deleted, added=added)


# ── Entries ───────────────────────────────────────────────────────────
@library_bp.get("/rag/systems/<int:sys_id>/entries")
@require_auth
def list_entries(sys_id):
    q              = (request.args.get("q")              or "").strip()
    disposition    = (request.args.get("disposition")    or "").strip()
    entry_category = (request.args.get("entry_category") or "").strip()

    sql    = "SELECT * FROM budget.rag_entries WHERE system_id = %s"
    params = [sys_id]
    if entry_category:
        sql += " AND entry_category = %s"
        params.append(entry_category)
    if q:
        sql += " AND (title ILIKE %s OR keywords ILIKE %s OR content ILIKE %s)"
        like = f"%{q}%"
        params += [like, like, like]
    if disposition:
        sql += " AND disposition = %s"
        params.append(disposition)
    sql += " ORDER BY updated_at DESC, id DESC"

    try:
        with db_cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = [row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(entries=rows)


@library_bp.post("/rag/systems/<int:sys_id>/entries")
@require_auth
def create_entry(sys_id):
    caller = current_user()
    if caller.get("role") == "viewer":
        return jsonify(error="檢視者無法新增資料"), 403

    data           = request.json or {}
    title          = (data.get("title")          or "").strip()
    keywords       = (data.get("keywords")       or "").strip() or None
    content        = (data.get("content")        or "").strip() or None
    example        = (data.get("example")        or "").strip() or None
    disposition    = (data.get("disposition")    or "").strip() or None
    note           = (data.get("note")           or "").strip() or None
    entry_category = (data.get("entry_category") or "其他").strip()

    if not title:
        return jsonify(error="標題為必填"), 400
    if disposition and disposition not in DISPOSITIONS:
        return jsonify(error=f"處置必須是 {'/'.join(DISPOSITIONS)} 其中之一"), 400
    if entry_category not in ENTRY_CATEGORIES:
        entry_category = "其他"

    try:
        with db_cursor(commit=True) as cur:
            cur.execute("SELECT 1 FROM budget.rag_systems WHERE id = %s", (sys_id,))
            if not cur.fetchone():
                return jsonify(error="系統類別不存在"), 404
            cur.execute(
                """INSERT INTO budget.rag_entries
                       (system_id, title, keywords, content, example, disposition, note,
                        entry_category, created_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (sys_id, title, keywords, content, example, disposition, note,
                 entry_category, caller.get("name")),
            )
            row = row_to_dict(cur.fetchone())
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(entry=row), 201


@library_bp.put("/rag/entries/<int:entry_id>")
@require_auth
def update_entry(entry_id):
    caller = current_user()
    if caller.get("role") == "viewer":
        return jsonify(error="檢視者無法修改資料"), 403

    data           = request.json or {}
    title          = (data.get("title")          or "").strip()
    keywords       = (data.get("keywords")       or "").strip() or None
    content        = (data.get("content")        or "").strip() or None
    example        = (data.get("example")        or "").strip() or None
    disposition    = (data.get("disposition")    or "").strip() or None
    note           = (data.get("note")           or "").strip() or None
    entry_category = (data.get("entry_category") or "其他").strip()

    if not title:
        return jsonify(error="標題為必填"), 400
    if disposition and disposition not in DISPOSITIONS:
        return jsonify(error=f"處置必須是 {'/'.join(DISPOSITIONS)} 其中之一"), 400
    if entry_category not in ENTRY_CATEGORIES:
        entry_category = "其他"

    try:
        with db_cursor(commit=True) as cur:
            cur.execute(
                """UPDATE budget.rag_entries
                   SET title = %s, keywords = %s, content = %s, example = %s,
                       disposition = %s, note = %s, entry_category = %s, updated_at = NOW()
                   WHERE id = %s RETURNING *""",
                (title, keywords, content, example, disposition, note,
                 entry_category, entry_id),
            )
            row = cur.fetchone()
            if not row:
                return jsonify(error="資料不存在"), 404
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(entry=row_to_dict(row))


@library_bp.delete("/rag/entries/<int:entry_id>")
@require_auth
def delete_entry(entry_id):
    caller = current_user()
    if caller.get("role") == "viewer":
        return jsonify(error="檢視者無法刪除資料"), 403
    try:
        with db_cursor(commit=True) as cur:
            cur.execute("DELETE FROM budget.rag_entries WHERE id = %s", (entry_id,))
    except Exception as e:
        return jsonify(error=str(e)), 500
    return jsonify(ok=True)
