// Free email extraction — no paid API.
// Given a creator's website, fetch the homepage + common contact pages with
// plain fetch() (built into the Vercel runtime) and pull emails out of the HTML,
// including lightly obfuscated ones like "hello [at] domain [dot] com".

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// "name [at] domain [dot] com" / "name (at) domain dot com" style obfuscation
const OBFUSCATED_RE =
  /([a-zA-Z0-9._%+-]+)\s*(?:\[at\]|\(at\)|\s+at\s+)\s*([a-zA-Z0-9.-]+)\s*(?:\[dot\]|\(dot\)|\s+dot\s+|\.)\s*([a-zA-Z]{2,})/gi;

// Things that look like emails in markup but aren't worth contacting.
const NOISE = /(sentry|wixpress|godaddy|squarespace|wordpress|\.png|\.jpe?g|\.gif|\.svg|\.webp|\.css|\.js|example\.com|@2x|@3x|domain\.com|email\.com|yourdomain)/i;
const ROLE_HINTS = ["contact", "hello", "business", "info", "booking", "press", "partnerships", "media", "team", "sponsor", "collab"];

async function fetchHtml(url, ms = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TimbreSignal/1.0)" },
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function harvest(html) {
  const found = new Set();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) found.add(m[1].toLowerCase());
  for (const m of html.matchAll(EMAIL_RE)) found.add(m[0].toLowerCase());
  for (const m of html.matchAll(OBFUSCATED_RE)) found.add(`${m[1]}@${m[2]}.${m[3]}`.toLowerCase());
  return [...found].filter((e) => e.length < 100 && !NOISE.test(e));
}

// Rank candidates best-first: same-domain and business inboxes win.
function rank(emails, domain) {
  const score = (e) => {
    let s = 0;
    const host = (e.split("@")[1] || "");
    if (domain && host.includes(domain)) s += 10; // same domain as their site = clearly theirs
    if (ROLE_HINTS.some((h) => e.startsWith(h))) s += 3; // business-y inbox
    return s;
  };
  return [...new Set(emails)].sort((a, b) => score(b) - score(a));
}

// Deliverability check: confirm the domain can actually receive mail (has MX,
// or at least resolves). Drops typo/dead domains so the data stays accurate.
// Cached per-domain for the life of the (warm) function instance.
const domainCache = new Map();
async function deliverable(domain) {
  if (!domain) return false;
  if (domainCache.has(domain)) return domainCache.get(domain);
  let ok = true;
  try {
    const dns = await import("node:dns/promises");
    try {
      const mx = await dns.resolveMx(domain);
      ok = Array.isArray(mx) && mx.length > 0;
    } catch (e) {
      // No MX record — fall back to an A record (some domains take mail anyway).
      try {
        const a = await dns.resolve(domain);
        ok = Array.isArray(a) && a.length > 0;
      } catch (e2) {
        // Domain genuinely doesn't resolve -> not deliverable.
        ok = !(e2 && ["ENOTFOUND", "ENODATA", "NXDOMAIN"].includes(e2.code));
      }
    }
  } catch {
    ok = true; // DNS unavailable in this runtime — don't drop data on our account
  }
  domainCache.set(domain, ok);
  return ok;
}

// Optional fallback: when free fetch reads nothing (JS-rendered / blocked
// site), ask the Scrapling service to try harder. No-op unless SCRAPER_URL is
// set, so it degrades gracefully.
async function scraplingFallback(websiteUrl) {
  const base = process.env.SCRAPER_URL;
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(base.replace(/\/$/, "") + "/scrape", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SCRAPER_SECRET ? { Authorization: `Bearer ${process.env.SCRAPER_SECRET}` } : {}),
      },
      body: JSON.stringify({ url: websiteUrl }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.email ? String(data.email).toLowerCase() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Returns the best *deliverable* email found on the site, or null. Bounded in
// time so it is safe to call inside a serverless request.
export async function extractEmail(websiteUrl) {
  if (!websiteUrl) return null;
  let base;
  try {
    base = new URL(websiteUrl);
  } catch {
    return null;
  }
  const domain = base.hostname.replace(/^www\./, "");
  const origin = base.origin;
  const pages = [websiteUrl, origin + "/contact", origin + "/contact-us", origin + "/about"];

  const all = new Set();
  for (const page of pages) {
    const html = await fetchHtml(page);
    if (!html) continue;
    for (const e of harvest(html)) all.add(e);
    // Early exit once we have a verified email on their own domain.
    for (const e of rank([...all], domain)) {
      const host = e.split("@")[1] || "";
      if (host.includes(domain) && (await deliverable(host))) return e;
    }
  }
  // Best deliverable email from anywhere on the site.
  for (const e of rank([...all], domain)) {
    if (await deliverable(e.split("@")[1] || "")) return e;
  }
  // Free fetch found nothing — let the Scrapling service try the hard sites.
  const viaService = await scraplingFallback(websiteUrl);
  if (viaService && (await deliverable(viaService.split("@")[1] || ""))) return viaService;
  return null;
}

// Choose the most likely personal/business website from a channel description,
// skipping social links (they rarely expose an email and often block scraping).
const URL_RE = /https?:\/\/[^\s)]+/g;
const SOCIAL = /(instagram|twitter|x\.com|tiktok|facebook|fb\.com|youtube|youtu\.be|patreon|discord|linktr\.ee|t\.me|threads|spotify|apple\.com|amazon|gumroad)/i;

export function pickWebsite(desc) {
  const urls = (desc.match(URL_RE) || []).map((u) => u.replace(/[.,)\]]+$/, ""));
  return urls.find((u) => !SOCIAL.test(u)) || urls[0] || null;
}
