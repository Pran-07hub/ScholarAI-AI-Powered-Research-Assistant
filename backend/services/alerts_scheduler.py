"""
Alerts Delivery Scheduler
Runs daily/weekly background jobs that query arXiv for new papers matching
each user's alert keywords and sends digest emails.

Requires: APScheduler (apscheduler>=3.10)
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timezone, timedelta
from typing import List, Dict

logger = logging.getLogger(__name__)

APP_URL = os.getenv("APP_URL", "http://localhost:3000")

# How many recent papers to surface per keyword per digest
MAX_PAPERS_PER_KEYWORD = 5


async def _fetch_arxiv_papers(keywords: List[str]) -> List[Dict]:
    """Query arXiv API for papers matching keywords published in the last 7 days."""
    import aiohttp

    query = " AND ".join(f'all:"{kw}"' for kw in keywords[:3])
    params = {
        "search_query": query,
        "start": 0,
        "max_results": MAX_PAPERS_PER_KEYWORD,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
    }

    papers = []
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
            async with session.get("https://export.arxiv.org/api/query", params=params) as resp:
                if resp.status != 200:
                    return []
                text = await resp.text()

        import xml.etree.ElementTree as ET
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(text)

        cutoff = datetime.now(timezone.utc) - timedelta(days=7)

        for entry in root.findall("atom:entry", ns):
            published_str = entry.findtext("atom:published", "", ns) or ""
            try:
                published = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
                if published < cutoff:
                    continue
            except Exception:
                pass

            title = (entry.findtext("atom:title", "", ns) or "").strip().replace("\n", " ")
            abstract = (entry.findtext("atom:summary", "", ns) or "").strip()
            authors = [a.findtext("atom:name", "", ns) for a in entry.findall("atom:author", ns)]
            link = ""
            for lnk in entry.findall("atom:link", ns):
                if lnk.get("rel") == "alternate":
                    link = lnk.get("href", "")
                    break

            if title:
                papers.append({
                    "title": title,
                    "abstract": abstract[:300] + "…" if len(abstract) > 300 else abstract,
                    "authors": authors[:3],
                    "link": link,
                    "published": published_str[:10],
                })
    except Exception as e:
        logger.warning("arXiv fetch failed for keywords %s: %s", keywords, e)

    return papers


def _build_digest_html(user_name: str, alerts_with_papers: List[Dict]) -> str:
    """Build HTML digest email body."""
    sections = ""
    for item in alerts_with_papers:
        keywords = item["keywords"]
        papers = item["papers"]
        if not papers:
            continue

        paper_rows = ""
        for p in papers:
            authors_str = ", ".join(p["authors"]) if p["authors"] else "Unknown authors"
            paper_rows += f"""
            <div style="margin-bottom:16px;padding:12px;background:#f9fafb;border-radius:8px;border-left:3px solid #6366f1">
              <a href="{p['link']}" style="font-weight:600;font-size:14px;color:#111;text-decoration:none">{p['title']}</a>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280">{authors_str} · {p['published']}</p>
              {f'<p style="margin:8px 0 0;font-size:13px;color:#444">{p["abstract"]}</p>' if p.get("abstract") else ""}
            </div>"""

        kw_label = ", ".join(f'"{k}"' for k in keywords)
        sections += f"""
        <h3 style="margin:24px 0 8px;font-size:16px;color:#111">Alert: {kw_label}</h3>
        {paper_rows}"""

    if not sections:
        sections = '<p style="color:#6b7280">No new papers found for your alerts this period. Check back next time.</p>'

    return f"""
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:40px 16px">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
        <tr>
          <td style="background:#6366f1;padding:24px 32px">
            <span style="color:#fff;font-size:20px;font-weight:700">ScholarAI</span>
            <span style="color:#c7d2fe;font-size:14px;margin-left:12px">Research Digest</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px">
            <h2 style="margin:0 0 8px;font-size:20px;color:#111">Your Research Digest</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280">
              Hi {user_name}, here are new papers matching your keyword alerts from the past week.
            </p>
            {sections}
            <p style="margin:32px 0 0;text-align:center">
              <a href="{APP_URL}/workspace/news"
                 style="background:#6366f1;color:#fff;padding:10px 24px;border-radius:6px;
                        text-decoration:none;font-weight:600;font-size:14px">
                Open ScholarAI
              </a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb">
            <p style="margin:0;font-size:12px;color:#9ca3af">
              You're receiving this because you set up keyword alerts on ScholarAI.<br>
              <a href="{APP_URL}/workspace/collaboration" style="color:#6366f1">Manage your alerts</a>
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


async def send_alert_digests() -> None:
    """
    Main scheduler job. For each user with active alerts whose frequency matches
    today (daily: every day, weekly: Mondays), fetch new papers and send digest.
    """
    from models import Alert, User
    from beanie import Link
    from services.email_service import send_email

    today_weekday = datetime.now(timezone.utc).weekday()  # 0 = Monday

    logger.info("Running alert digest job")

    try:
        alerts = await Alert.find_all().to_list()
    except Exception as e:
        logger.error("Failed to load alerts: %s", e)
        return

    # Group alerts by user
    user_alerts: Dict[str, List] = {}
    for alert in alerts:
        uid_str = str(alert.user_id.ref.id if isinstance(alert.user_id, Link) else alert.user_id.id)
        user_alerts.setdefault(uid_str, []).append(alert)

    for uid_str, user_alert_list in user_alerts.items():
        # Filter by frequency — skip weekly alerts on non-Monday
        eligible = [
            a for a in user_alert_list
            if a.frequency == "daily" or (a.frequency == "weekly" and today_weekday == 0)
        ]
        if not eligible:
            continue

        # Fetch user for email
        try:
            user_id_obj = user_alert_list[0].user_id
            if isinstance(user_id_obj, Link):
                user = await User.get(user_id_obj.ref.id)
            else:
                user = await User.get(user_id_obj.id)
            if not user:
                continue
        except Exception as e:
            logger.warning("Could not load user %s: %s", uid_str, e)
            continue

        # Fetch papers for each alert
        alerts_with_papers = []
        for alert in eligible:
            if not alert.keywords:
                continue
            papers = await _fetch_arxiv_papers(alert.keywords)
            alerts_with_papers.append({"keywords": alert.keywords, "papers": papers})

        # Only send if at least one alert has papers
        any_papers = any(item["papers"] for item in alerts_with_papers)
        if not any_papers:
            logger.info("No new papers for user %s, skipping digest", user.email)
            continue

        html = _build_digest_html(user.username, alerts_with_papers)
        await send_email(
            to=user.email,
            subject="Your ScholarAI Research Digest",
            html=html,
        )
        logger.info("Sent digest to %s (%d alerts)", user.email, len(eligible))


def start_scheduler(app) -> None:
    """Start APScheduler attached to the FastAPI app lifecycle."""
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
    except ImportError:
        logger.warning("apscheduler not installed — alert delivery disabled")
        return

    scheduler = AsyncIOScheduler()

    # Run daily at 08:00 UTC
    scheduler.add_job(
        send_alert_digests,
        trigger=CronTrigger(hour=8, minute=0, timezone="UTC"),
        id="alert_digests",
        replace_existing=True,
        max_instances=1,
        misfire_grace_time=3600,
    )

    scheduler.start()
    app.state.scheduler = scheduler
    logger.info("Alert digest scheduler started (runs daily at 08:00 UTC)")


def stop_scheduler(app) -> None:
    """Gracefully shut down the scheduler."""
    scheduler = getattr(app.state, "scheduler", None)
    if scheduler and scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("Alert digest scheduler stopped")
