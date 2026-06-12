"""Send dispatch notification emails via the internal SMTP relay."""
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

logger = logging.getLogger(__name__)


def _big5_safe(text: str) -> str:
    """Replace any character outside the Big5 repertoire with its HTML numeric
    entity so the body can be sent with charset=big5 — needed because the
    internal mail relay / Lotus Notes 6.5 client renders UTF-8 中文 as 亂碼。"""
    out = []
    for ch in text:
        try:
            ch.encode("big5")
            out.append(ch)
        except UnicodeEncodeError:
            out.append(f"&#{ord(ch)};")
    return "".join(out)


def _resolve_cc(category, system, expert_name, to_email):
    """Build the final CC list = fixed CC + matched rule CC, honoring test mode.

    Returns (cc_list, redirect_to). When redirect_to is set (test mode), the
    caller should send the whole mail only to that address.
    """
    try:
        from config import SMTP_ALWAYS_CC
    except ImportError:
        SMTP_ALWAYS_CC = ""
    try:
        from config import EMAIL_CC_RULES
    except ImportError:
        EMAIL_CC_RULES = []
    try:
        from config import EMAIL_TEST_MODE
    except ImportError:
        EMAIL_TEST_MODE = False
    try:
        from config import EMAIL_TEST_REDIRECT_TO
    except ImportError:
        EMAIL_TEST_REDIRECT_TO = ""

    # Test mode: optionally redirect everything to a single inbox, and never CC.
    if EMAIL_TEST_MODE:
        redirect = (EMAIL_TEST_REDIRECT_TO or "").strip()
        return [], redirect

    # Fixed CC (comma-separated supported)
    cc = [a.strip() for a in (SMTP_ALWAYS_CC or "").replace(";", ",").split(",") if a.strip()]

    # Rule-based CC
    field_value = {
        "category": (category or "").strip(),
        "system":   (system or "").strip(),
        "expert":   (expert_name or "").strip(),
    }
    for rule in (EMAIL_CC_RULES or []):
        fld = rule.get("field")
        val = field_value.get(fld, "")
        matched = False
        if "equals" in rule:
            matched = val == (rule.get("equals") or "").strip()
        elif "contains" in rule:
            needle = (rule.get("contains") or "").strip()
            matched = bool(needle) and needle.lower() in val.lower()
        if matched:
            for addr in (rule.get("cc") or []):
                if addr and addr.strip():
                    cc.append(addr.strip())

    # Dedup (case-insensitive) and drop the primary recipient
    seen, out = set(), []
    for addr in cc:
        low = addr.lower()
        if low == (to_email or "").lower() or low in seen:
            continue
        seen.add(low)
        out.append(addr)
    return out, ""


def send_dispatch_email(
    to_email: str,
    expert_name: str,
    project_name: str,
    budget_id: int,
    budget_no: Optional[str],
    amount: Optional[float],
    dispatch_date: Optional[str],
    category: Optional[str] = None,
    system: Optional[str] = None,
) -> bool:
    """Send a dispatch notification to the assigned expert. Returns True on success."""
    try:
        from config import SMTP_SERVER, SMTP_PORT, SMTP_SENDER, SMTP_SENDER_NAME
        try:
            from config import EMAIL_REVIEW_CHECKLIST, EMAIL_REVIEW_PS
        except ImportError:
            EMAIL_REVIEW_CHECKLIST = ["預算需求目的", "作法", "改善效益", "預算合理性", "是否核准預算"]
            EMAIL_REVIEW_PS = ""
    except ImportError as e:
        logger.warning("Email config missing: %s", e)
        return False

    if not SMTP_SERVER or not SMTP_SENDER:
        logger.debug("Email send skipped — SMTP config not set")
        return False

    subject = f"【預算AI審核平台】您有一筆待審核的預算案件 — {project_name}"

    amount_str = f"NT$ {amount:,.0f}" if amount else "—"
    budget_no_str = budget_no or f"#{budget_id}"
    date_str = dispatch_date[:10] if dispatch_date else "—"

    # Build review checklist rows
    checklist_rows = "".join(
        f'<tr><td style="padding:6px 0 6px 8px;font-size:13px;color:#555;'
        f'border-bottom:1px solid #ecdfd6;vertical-align:top;width:24px;">'
        f'{i+1}.</td>'
        f'<td style="padding:6px 0 6px 4px;font-size:13px;color:#333;'
        f'border-bottom:1px solid #ecdfd6;">{item}</td></tr>'
        for i, item in enumerate(EMAIL_REVIEW_CHECKLIST)
    )
    ps_html = ""
    if EMAIL_REVIEW_PS:
        ps_lines = EMAIL_REVIEW_PS.replace("\n", "<br/>")
        ps_html = (
            f'<div style="margin-top:10px;padding:10px 14px;background:#fff8e1;'
            f'border-left:3px solid #f59e0b;border-radius:4px;'
            f'font-size:12px;color:#92660a;line-height:1.7;">'
            f'<strong>PS：</strong>{ps_lines}</div>'
        )

    html_body = f"""
<!DOCTYPE html>
<html lang="zh-TW">
<head><meta charset="Big5"/></head>
<body style="margin:0;padding:0;background:#f7f5f0;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f0;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:12px;overflow:hidden;
                    box-shadow:0 4px 16px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background-color:#c0456a;background:linear-gradient(135deg,#e86b4f,#c0456a);
                     padding:28px 32px;color:#fff;">
            <div style="font-size:13px;opacity:0.85;letter-spacing:0.06em;margin-bottom:6px;">
              預算AI審核平台
            </div>
            <div style="font-size:22px;font-weight:700;line-height:1.2;">
              您有一筆待審核的預算案件
            </div>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:28px 32px 8px;">
            <p style="margin:0;font-size:15px;color:#333;line-height:1.7;">
              {expert_name} 您好，<br/>
              以下預算案件已派發給您，請登入系統完成專家複審。<br/>
              <br/>
              系統連接：<a href="http://10.10.51.118:5000" style="color:#c0456a;text-decoration:none;font-weight:600;">10.10.51.118:5000</a>
            </p>
          </td>
        </tr>

        <!-- Case detail card -->
        <tr>
          <td style="padding:12px 32px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="background:#fdf8f4;border-radius:8px;
                          border:1px solid #ecdfd6;overflow:hidden;">
              <tr style="background:#f3ede7;">
                <td colspan="2" style="padding:12px 18px;font-size:11px;
                    font-weight:700;color:#a06050;letter-spacing:0.08em;">
                  案件資訊
                </td>
              </tr>
              <tr>
                <td style="padding:10px 18px;width:35%;font-size:13px;
                    color:#888;border-bottom:1px solid #ecdfd6;">預算單號</td>
                <td style="padding:10px 18px;font-size:13px;font-weight:600;
                    color:#c0456a;font-family:monospace;
                    border-bottom:1px solid #ecdfd6;">{budget_no_str}</td>
              </tr>
              <tr style="background:#fffcfa;">
                <td style="padding:10px 18px;font-size:13px;color:#888;
                    border-bottom:1px solid #ecdfd6;">項目名稱</td>
                <td style="padding:10px 18px;font-size:13px;font-weight:600;
                    color:#333;border-bottom:1px solid #ecdfd6;">{project_name}</td>
              </tr>
              <tr>
                <td style="padding:10px 18px;font-size:13px;color:#888;
                    border-bottom:1px solid #ecdfd6;">預算金額</td>
                <td style="padding:10px 18px;font-size:14px;font-weight:700;
                    color:#333;border-bottom:1px solid #ecdfd6;">{amount_str}</td>
              </tr>
              <tr style="background:#fffcfa;">
                <td style="padding:10px 18px;font-size:13px;color:#888;">派送日期</td>
                <td style="padding:10px 18px;font-size:13px;
                    color:#333;font-family:monospace;">{date_str}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Review checklist -->
        <tr>
          <td style="padding:0 32px 20px;">
            <div style="background:#fdf8f4;border-radius:8px;
                        border:1px solid #ecdfd6;overflow:hidden;">
              <div style="background:#f3ede7;padding:10px 18px;
                          font-size:11px;font-weight:700;color:#a06050;
                          letter-spacing:0.08em;">複審項目</div>
              <div style="padding:8px 18px 12px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  {checklist_rows}
                </table>
                {ps_html}
              </div>
            </div>
          </td>
        </tr>

        <!-- SLA reminder -->
        <tr>
          <td style="padding:0 32px 24px;">
            <div style="background:#fff8e1;border-left:4px solid #f59e0b;
                        border-radius:4px;padding:12px 16px;
                        font-size:13px;color:#92660a;line-height:1.6;">
              <strong>SLA 提醒：</strong>
              請於派送後 <strong>3 個工作天內</strong> 完成審核，逾期將觸發系統催辦通知。
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:18px 32px 28px;border-top:1px solid #ecdfd6;">
            <p style="margin:0;font-size:12px;color:#aaa;line-height:1.6;">
              此信件由系統自動發送，請勿直接回覆。<br/>
              如有系統相關疑問請聯繫系統管理員 Jarven #16270。
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
"""

    try:
        cc_list, redirect_to = _resolve_cc(category, system, expert_name, to_email)

        # Test mode redirect: send the whole mail only to the test inbox.
        primary = redirect_to or to_email
        if redirect_to:
            cc_list = []

        msg = MIMEMultipart("alternative")
        msg["From"] = f"{SMTP_SENDER_NAME} <{SMTP_SENDER}>"
        msg["To"] = primary
        msg["Subject"] = subject

        recipients = [primary]
        if cc_list:
            msg["Cc"] = ", ".join(cc_list)
            recipients.extend(cc_list)

        msg.attach(MIMEText(_big5_safe(html_body), "html", "big5"))

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
            server.sendmail(SMTP_SENDER, recipients, msg.as_string())

        logger.info("Dispatch email sent to %s (cc=%s%s) for budget #%s",
                    primary, ", ".join(cc_list) or "—",
                    " [TEST REDIRECT]" if redirect_to else "", budget_id)
        return True

    except Exception as e:
        logger.warning("Dispatch email failed (to=%s, budget=#%s): %s", to_email, budget_id, e)
        return False
