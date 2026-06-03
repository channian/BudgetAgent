"""AD 認證 API：登入 / 登出 / 目前使用者。"""
import hashlib
import logging
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, settings
from models import HvmRole
from auth.ldap_client import authenticate_and_sync
from auth.jwt_handler import create_access_token, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

# 使用者 DB 連線（hvm_users VIEW 所在，可能與主 DB 不同）
_ad_db_url = settings.ad_db_url or settings.database_url
_ad_engine = create_engine(
    _ad_db_url,
    connect_args={"check_same_thread": False} if "sqlite" in _ad_db_url else {},
    pool_size=2,
    max_overflow=2,
)


class LoginRequest(BaseModel):
    username: str
    password: str


def _get_role(db: Session, username: str, is_local_admin: bool) -> str:
    """
    Plan C 角色判斷：
    1. hvm_roles 有明確設定 → 依設定
    2. 無設定 + is_local_admin → admin
    3. 其餘 → user
    """
    row = db.query(HvmRole).filter_by(username=username).first()
    if row:
        return row.role
    return "admin" if is_local_admin else "user"


def _query_hvm_user(username: str) -> dict | None:
    """從 hvm_users VIEW 取使用者基本資料（使用獨立的 AD_DB 連線）。"""
    try:
        with _ad_engine.connect() as conn:
            row = conn.execute(
                text("SELECT username, display_name, email, department, title, is_local_admin "
                     "FROM hvm_users WHERE username = :u"),
                {"u": username},
            ).fetchone()
    except Exception as e:
        logger.warning("hvm_users query failed for %s: %s", username, e)
        return None
    if row is None:
        return None
    return {
        "username":       row.username,
        "display_name":   row.display_name,
        "email":          row.email,
        "department":     row.department,
        "title":          row.title,
        "is_local_admin": bool(row.is_local_admin),
    }


def _try_local_admin(username: str, password: str) -> bool:
    """驗證本機管理員帳密（SHA-256 hash）。"""
    if not settings.local_admin_username or not settings.local_admin_password_hash:
        return False
    if username != settings.local_admin_username:
        return False
    given = hashlib.sha256(password.encode()).hexdigest()
    return given == settings.local_admin_password_hash


def _set_auth_cookie(response: Response, token: str):
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=settings.access_token_expire_minutes * 60,
        samesite="lax",
    )


@router.post("/login")
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    # 1. 先嘗試 AD LDAP 驗證
    ldap_info = authenticate_and_sync(body.username, body.password)

    if ldap_info:
        # 從 hvm_users VIEW 取角色判斷所需的 is_local_admin
        hvm_user = _query_hvm_user(body.username)
        is_local_admin = hvm_user["is_local_admin"] if hvm_user else False
        role         = _get_role(db, body.username, is_local_admin)
        display_name = ldap_info.get("display_name") or body.username
        token = create_access_token(body.username, role, display_name)
        _set_auth_cookie(response, token)
        return {
            "ok":          True,
            "username":    body.username,
            "display_name": display_name,
            "role":        role,
            "department":  ldap_info.get("department"),
            "title":       ldap_info.get("title"),
        }

    # 2. AD 連線失敗或帳密錯 → 嘗試本機管理員 fallback
    if _try_local_admin(body.username, body.password):
        role  = "admin"
        token = create_access_token(body.username, role, "Local Admin")
        _set_auth_cookie(response, token)
        return {
            "ok":          True,
            "username":    body.username,
            "display_name": "Local Admin",
            "role":        role,
            "department":  None,
            "title":       None,
        }

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="帳號或密碼錯誤")


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"ok": True}


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    return current_user
