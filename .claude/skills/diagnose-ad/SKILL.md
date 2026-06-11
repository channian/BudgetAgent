# Diagnose AD Login

診斷 AD / NTLM 登入失敗的標準流程。依序執行以下步驟，找到根本原因後直接修復。

## Step 1 — 確認 ldap3 在正確的 venv 裡

```bash
# 在 Flask 的 venv 目錄下執行（Windows 路徑範例）
<venv>\Scripts\pip list | findstr ldap3

# 若沒有輸出 → 裝進 venv（不是系統 Python）
<venv>\Scripts\pip install ldap3
```

若系統 Python 有但 venv 沒有：**只裝進 venv，不要動系統 Python。**

## Step 2 — 確認 domain 設定

打開 `backend/config.py`，確認：

```python
LDAP_DOMAIN   = "KH"          # 必須是 KH，不是 ASE
LDAP_SERVER   = "10.10.10.2"  # KHADDC04
LDAP_UPN_SUFFIX = "kh.asegroup.com"
```

如果是 `ASE` → 改成 `KH`，重啟 backend。

## Step 3 — 打 /test-login 端點實測

```bash
curl -X POST http://localhost:5000/api/auth/test-login \
  -H "Content-Type: application/json" \
  -d '{"empno": "K20076", "password": "YOUR_PASSWORD"}'
```

觀察回傳：
- `{"ok": true}` → AD bind 成功
- `{"error": "LDAP bind failed"}` → domain 或 IP 有問題
- `{"error": "ldap3 not found"}` → Step 1 沒裝好

## Step 4 — 確認 AD server 可到達

```bash
ping 10.10.10.2
# 或
Test-NetConnection -ComputerName 10.10.10.2 -Port 389
```

## 常見根本原因對照表

| 症狀 | 原因 | 修法 |
|---|---|---|
| `ModuleNotFoundError: ldap3` | ldap3 在系統 Python 不在 venv | Step 1 裝進 venv |
| `LDAP bind failed` | domain 設成 ASE | Step 2 改成 KH |
| `Connection refused` | AD server 不通 | Step 4 確認網路 |
| 登入成功但名字沒同步 | HR DB 連線問題 | 確認 `HR_DB` 設定 |
