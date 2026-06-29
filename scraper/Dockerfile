# Lean image: Scrapling's HTTP Fetcher (TLS-impersonation) needs no browser,
# so this fits free-tier hosts (Railway / Render / Fly). For browser-based
# StealthyFetcher (USE_STEALTH=1) you need a bigger base + `scrapling install`
# (see README) — most creator sites don't require it.
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends gcc ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
EXPOSE 8080
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]
