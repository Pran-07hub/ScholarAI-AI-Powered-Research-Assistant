"""
Email notification service.
Uses SMTP — configure via environment variables:

  SMTP_HOST     (default: smtp.gmail.com)
  SMTP_PORT     (default: 587)
  SMTP_USER     sender email address
  SMTP_PASSWORD sender password / app-password
  APP_URL       frontend base URL shown in the email (default: http://localhost:3000)

If SMTP_USER is not set, email sending is silently skipped and a warning is logged.
"""

import asyncio
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
APP_URL = os.getenv("APP_URL", "http://localhost:3000")


SMTP_TIMEOUT = int(os.getenv("SMTP_TIMEOUT", "15"))  # seconds


def _send_email_sync(to: str, subject: str, html: str) -> None:
    """Blocking SMTP send — always run in executor, never on the event loop thread."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning(
            "SMTP_USER / SMTP_PASSWORD not set — skipping email to %s (subject: %s)", to, subject
        )
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"ScholarAI <{SMTP_USER}>"
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT) as server:
        server.ehlo()
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, to, msg.as_string())

    logger.info("Email sent to %s: %s", to, subject)


async def send_email(to: str, subject: str, html: str) -> None:
    """Send an email asynchronously (runs blocking SMTP in a thread-pool executor with timeout)."""
    try:
        loop = asyncio.get_running_loop()
        await asyncio.wait_for(
            loop.run_in_executor(None, _send_email_sync, to, subject, html),
            timeout=SMTP_TIMEOUT + 5,
        )
    except asyncio.TimeoutError:
        logger.error("Email send timed out for %s (subject: %s)", to, subject)
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, e)


# ── Email templates ───────────────────────────────────────────────────────────

def _base(title: str, body: str, cta_url: str = "", cta_label: str = "") -> str:
    cta_block = (
        f'<p style="margin:24px 0 0">'
        f'<a href="{cta_url}" style="background:#6366f1;color:#fff;padding:10px 22px;'
        f'border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">'
        f'{cta_label}</a></p>'
    ) if cta_url else ""

    return f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <!-- Header -->
        <tr>
          <td style="background:#6366f1;padding:24px 32px">
            <span style="color:#fff;font-size:20px;font-weight:700">ScholarAI</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 16px;font-size:20px;color:#111">{title}</h2>
            <div style="font-size:14px;color:#444;line-height:1.7">{body}{cta_block}</div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">
              You received this email because someone invited you to ScholarAI.<br>
              If you didn't expect this, you can ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def send_project_invite_email(
    to_email: str,
    inviter_name: str,
    project_name: str,
    is_existing_user: bool,
) -> None:
    """Send a collaboration invite email."""
    if is_existing_user:
        subject = f'{inviter_name} added you to "{project_name}" on ScholarAI'
        body = (
            f"<p>Hi,</p>"
            f"<p><strong>{inviter_name}</strong> has added you as a collaborator on the project "
            f"<strong>{project_name}</strong> in ScholarAI.</p>"
            f"<p>You can access the shared workspace right now.</p>"
        )
        cta_url = f"{APP_URL}/workspace/collaboration"
        cta_label = "Open Workspace"
    else:
        subject = f"{inviter_name} invited you to collaborate on ScholarAI"
        body = (
            f"<p>Hi,</p>"
            f"<p><strong>{inviter_name}</strong> has invited you to collaborate on "
            f"<strong>{project_name}</strong> in ScholarAI — an AI-powered research platform.</p>"
            f"<p>Create your free account to accept the invitation and start collaborating.</p>"
        )
        cta_url = f"{APP_URL}/auth?invite=1&email={to_email}"
        cta_label = "Accept Invitation"

    await send_email(to_email, subject, _base(subject, body, cta_url, cta_label))
