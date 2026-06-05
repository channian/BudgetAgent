"""
使用者管理工具（建立帳號 + 設定密碼）
用法：python set_password.py

功能：
  - 帳號不存在 → 建立新帳號（輸入 empno / role，name/email 會在 AD 登入後自動同步）
  - 帳號已存在 → 設定 / 更新本地備用密碼（AD 登入不需要此密碼）
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from werkzeug.security import generate_password_hash
import psycopg2, psycopg2.extras, getpass

DB_CONFIG = {
    "dbname":   "CIM",
    "user":     "cim_admin",
    "password": "1qaz2wsx3edc",
    "host":     "10.10.28.170",
    "port":     "5432",
    "options":  "-c search_path=budget",
}

VALID_ROLES = ("admin", "boss", "expert", "viewer")


def main():
    print("═" * 55)
    print("  AI Agent 預算審核平台 — 使用者管理工具")
    print("═" * 55)

    empno = input("請輸入員工編號 empno（登入帳號）：").strip()
    if not empno:
        print("❌ 員工編號不得為空")
        return

    conn = psycopg2.connect(**DB_CONFIG)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, name, role FROM budget.users WHERE ad_account = %s", (empno,))
    user = cur.fetchone()

    if not user:
        # ── 帳號不存在 → 建立新帳號 ─────────────────────────────────
        print(f"\n⚠️  找不到帳號「{empno}」，建立新帳號。")
        print("（name / email 會在第一次 AD 登入後自動從 HR DB 同步）\n")

        name = input("請輸入顯示姓名（可暫填任意，AD 登入後自動更新）：").strip()
        if not name:
            name = empno   # 至少要有值（NOT NULL）

        print(f"可用角色：{' / '.join(VALID_ROLES)}")
        role = input("請輸入角色（預設 admin）：").strip() or "admin"
        if role not in VALID_ROLES:
            print(f"❌ 無效角色「{role}」，請輸入以下其中一個：{VALID_ROLES}")
            conn.close(); return

        cur.execute(
            """INSERT INTO budget.users (name, ad_account, role)
               VALUES (%s, %s, %s) RETURNING id""",
            (name, empno, role),
        )
        conn.commit()
        new_id = cur.fetchone()["id"]
        print(f"\n✅ 帳號已建立（id={new_id}）：empno={empno}  role={role}")
        print("   → 現在可以用 AD 帳密（empno + Windows 密碼）登入平台。")
        print("   → 登入後 name / email 會自動從 HR DB 同步更新。\n")

        set_pw = input("是否同時設定本地備用密碼？（AD 登入不需要此密碼，可按 Enter 跳過）[y/N]：").strip().lower()
        if set_pw != "y":
            cur.close(); conn.close(); return

        # 繼續到下方設定密碼
        cur.execute("SELECT id, name, role FROM budget.users WHERE ad_account = %s", (empno,))
        user = cur.fetchone()

    else:
        print(f"\n✅ 找到使用者：{user['name']} ({user['role']})")

    # ── 設定 / 更新密碼 ──────────────────────────────────────────────
    print("\n設定本地備用密碼（AD 不可用時使用）：")
    new_pass  = getpass.getpass("請輸入新密碼（輸入不顯示）：")
    new_pass2 = getpass.getpass("請再次輸入確認：")
    if new_pass != new_pass2:
        print("❌ 兩次輸入不一致"); conn.close(); return
    if not new_pass:
        print("❌ 密碼不得為空"); conn.close(); return

    hashed = generate_password_hash(new_pass)
    cur.execute("UPDATE budget.users SET password = %s WHERE id = %s", (hashed, user["id"]))
    conn.commit()
    print(f"✅ 「{user['name']}」密碼已更新成功")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
