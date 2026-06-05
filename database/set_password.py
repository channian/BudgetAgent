"""
設定使用者密碼工具
用法：python set_password.py

執行後輸入 ad_account 與密碼，工具自動產生雜湊並更新 budget.users。
密碼支援中英文、數字與特殊符號（*, &, @, # 等）。
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


def main():
    print("═" * 50)
    print("  AI Agent 預算審核平台 — 設定使用者密碼")
    print("═" * 50)

    ad_account = input("請輸入 ad_account（登入帳號）：").strip()
    if not ad_account:
        print("❌ 帳號不得為空")
        return

    # Verify account exists
    conn = psycopg2.connect(**DB_CONFIG)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute("SELECT id, name, role FROM budget.users WHERE ad_account = %s", (ad_account,))
    user = cur.fetchone()
    if not user:
        print(f"❌ 找不到帳號「{ad_account}」，請確認後再試")
        conn.close()
        return

    print(f"✅ 找到使用者：{user['name']} ({user['role']})")

    new_pass  = getpass.getpass("請輸入新密碼（輸入不顯示）：")
    new_pass2 = getpass.getpass("請再次輸入確認：")
    if new_pass != new_pass2:
        print("❌ 兩次輸入不一致")
        conn.close()
        return
    if not new_pass:
        print("❌ 密碼不得為空")
        conn.close()
        return

    hashed = generate_password_hash(new_pass)
    cur.execute("UPDATE budget.users SET password = %s WHERE id = %s", (hashed, user["id"]))
    conn.commit()
    cur.close()
    conn.close()
    print(f"✅ 「{user['name']}」密碼已更新成功")


if __name__ == "__main__":
    main()
