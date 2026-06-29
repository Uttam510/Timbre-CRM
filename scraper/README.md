# Timbre scraper service (Scrapling)

A tiny FastAPI service that wraps [Scrapling](https://github.com/D4Vinci/Scrapling)
to read sites the main app's free `fetch()` can't (JS-rendered, Cloudflare,
TLS-fingerprint blocks) and extract a contact email.

The Next.js app calls it **only as a fallback** — when its own free scrape
returns nothing — so this service is optional. If it isn't configured, the app
just keeps using free fetch.

## Endpoints
- `GET /health` → `{"ok": true, "stealth": false}`
- `POST /scrape` with body `{"url": "https://creator.com"}` →
  `{"email": "hello@creator.com", "emails": [...], "source": "scrapling"}`
  - Send header `Authorization: Bearer <SCRAPER_SECRET>` if `SCRAPER_SECRET` is set.

## Run locally
```bash
cd scraper
pip install -r requirements.txt
uvicorn main:app --port 8080
curl -X POST localhost:8080/scrape -H 'content-type: application/json' -d '{"url":"https://example.com"}'
```

## Deploy free (Docker)
Any host that builds a Dockerfile works. The image is browser-free, so it fits
free tiers.

**Railway / Render / Fly.io:**
1. Create a new service from this repo, root directory `scraper/`.
2. It auto-detects the `Dockerfile`.
3. Set env vars:
   - `SCRAPER_SECRET` — a random string (must match what you put in Vercel).
   - `USE_STEALTH` — leave unset for free tier (no browser). Set `1` only on a
     host with browsers installed (see below).
4. Deploy. Note the public URL, e.g. `https://timbre-scraper.up.railway.app`.

## Wire it into the app (Vercel env vars)
Add these to the Vercel project (Settings → Environment Variables), then redeploy:
- `SCRAPER_URL` = the service URL (e.g. `https://timbre-scraper.up.railway.app`)
- `SCRAPER_SECRET` = the same secret you set on the service

That's it — the app will start using it automatically as a fallback.

## Optional: browser stealth mode
Most small-creator sites are served fine by the HTTP `Fetcher`. If you hit a
chunk of JS-only/hard-Cloudflare sites, enable the browser fetcher:
1. Use a host with more memory (browsers need ~1GB+).
2. In the Dockerfile, after installing requirements, add: `RUN scrapling install`
   (downloads browser binaries + system deps).
3. Set `USE_STEALTH=1`.

> Note: `main.py` calls Scrapling's `Fetcher.get(...)` / `StealthyFetcher.fetch(...)`.
> If you pin a Scrapling version whose API differs, adjust those two calls in
> `fetch_html()` — the rest (email harvesting) is plain Python.
