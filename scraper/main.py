"""
Timbre scraper service — a small HTTP wrapper around Scrapling.

The main app (Next.js on Vercel) calls this only as a *fallback*, when its own
free fetch() can't read a creator's site (JS-rendered, Cloudflare, TLS
fingerprint blocks). Scrapling's Fetcher does stealthy HTTP with TLS
impersonation by default; set USE_STEALTH=1 to also try the browser-based
StealthyFetcher (needs browsers installed — see README, heavier host).

Endpoints:
  GET  /health        -> {"ok": true}
  POST /scrape {url}   -> {"email": <best or null>, "emails": [...], "source": "scrapling"}
"""
import os
import re
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from scrapling.fetchers import Fetcher

USE_STEALTH = os.getenv("USE_STEALTH") == "1"
StealthyFetcher = None
if USE_STEALTH:
    try:
        from scrapling.fetchers import StealthyFetcher as _SF
        StealthyFetcher = _SF
    except Exception:
        StealthyFetcher = None

SECRET = os.getenv("SCRAPER_SECRET")

app = FastAPI(title="Timbre scraper")

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
OBFUSCATED_RE = re.compile(
    r"([a-zA-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\s+at\s+)\s*([a-zA-Z0-9.-]+)\s*(?:\[dot\]|\(dot\)|\s+dot\s+|\.)\s*([a-zA-Z]{2,})",
    re.I,
)
NOISE = re.compile(
    r"(sentry|wixpress|godaddy|squarespace|wordpress|\.png|\.jpe?g|\.gif|\.svg|\.webp|\.css|\.js|example\.com|@2x|@3x|domain\.com|yourdomain)",
    re.I,
)
ROLE_HINTS = ("contact", "hello", "business", "info", "booking", "press", "partnerships", "media", "team", "sponsor", "collab")


class ScrapeReq(BaseModel):
    url: str


def _html_of(page):
    """Pull raw HTML off a Scrapling response across API variants."""
    for attr in ("html_content", "body", "html"):
        val = getattr(page, attr, None)
        if isinstance(val, str) and val:
            return val
    try:
        return str(page)
    except Exception:
        return ""


def fetch_html(url):
    # 1) Stealthy HTTP (TLS fingerprint impersonation) — fast, no browser.
    try:
        page = Fetcher.get(url, stealthy_headers=True, timeout=15)
        if page is not None and getattr(page, "status", 200) in (200, 201, 202, None):
            html = _html_of(page)
            if html:
                return html
    except Exception:
        pass
    # 2) Browser-based stealth — only if explicitly enabled.
    if StealthyFetcher is not None:
        try:
            page = StealthyFetcher.fetch(url, headless=True, network_idle=True)
            html = _html_of(page)
            if html:
                return html
        except Exception:
            pass
    return ""


def harvest(html):
    found = set()
    for m in re.finditer(r"mailto:([^\"'?>\s]+)", html, re.I):
        found.add(m.group(1).lower())
    for m in EMAIL_RE.finditer(html):
        found.add(m.group(0).lower())
    for m in OBFUSCATED_RE.finditer(html):
        found.add(f"{m.group(1)}@{m.group(2)}.{m.group(3)}".lower())
    return [e for e in found if len(e) < 100 and not NOISE.search(e)]


def rank(emails, domain):
    def score(e):
        s = 0
        host = e.split("@")[1] if "@" in e else ""
        if domain and domain in host:
            s += 10
        if any(e.startswith(h) for h in ROLE_HINTS):
            s += 3
        return s

    return sorted(set(emails), key=score, reverse=True)


@app.get("/health")
def health():
    return {"ok": True, "stealth": StealthyFetcher is not None}


@app.post("/scrape")
def scrape(req: ScrapeReq, authorization: str = Header(default="")):
    if SECRET and authorization != f"Bearer {SECRET}":
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        base = urlparse(req.url)
        if not base.scheme or not base.netloc:
            return {"email": None, "emails": [], "source": "scrapling"}
    except Exception:
        return {"email": None, "emails": [], "source": "scrapling"}

    domain = base.netloc.replace("www.", "")
    origin = f"{base.scheme}://{base.netloc}"
    pages = [req.url, origin + "/contact", origin + "/contact-us", origin + "/about"]

    collected = set()
    for p in pages:
        html = fetch_html(p)
        if not html:
            continue
        for e in harvest(html):
            collected.add(e)
        # Early exit on a same-domain hit.
        for e in rank(list(collected), domain):
            host = e.split("@")[1] if "@" in e else ""
            if domain and domain in host:
                return {"email": e, "emails": rank(list(collected), domain), "source": "scrapling"}

    ranked = rank(list(collected), domain)
    return {"email": ranked[0] if ranked else None, "emails": ranked, "source": "scrapling"}
