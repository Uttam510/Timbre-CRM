// Shared discovery core, used by both the live streaming search
// (app/api/discover) and the scheduled job (app/api/cron).
import { scoreCreator, gradeFor } from "./score";
import { extractEmail, pickWebsite } from "./extract";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function yt(path, params) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Set YOUTUBE_API_KEY in your environment.");
  const url = new URL("https://www.googleapis.com/youtube/v3/" + path);
  Object.entries({ ...params, key }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "YouTube API error");
  return data;
}

// Run one search query end-to-end: find channels, filter to the sub band,
// score, scrape for an email, and upsert leads. `emit` receives progress
// events (used for live streaming; pass a no-op for background jobs).
export async function processQuery({ supabase, query, segment, minSubs = 5000, maxSubs = 200000, emit = () => {} }) {
  let saved = 0, found = 0;
  if (!query) throw new Error("A search query is required.");

  emit({ type: "status", msg: "Searching YouTube for " + query });
  const search = await yt("search", { part: "snippet", type: "channel", q: query, maxResults: "50" });
  const ids = (search.items || []).map((i) => i.snippet?.channelId || i.id?.channelId).filter(Boolean);
  emit({ type: "status", msg: "Found " + ids.length + " channels" });
  if (ids.length === 0) return { found, saved };

  emit({ type: "status", msg: "Pulling channel details" });
  const details = await yt("channels", { part: "snippet,statistics,contentDetails", id: ids.join(",") });
  emit({ type: "status", msg: "Filtering to " + minSubs.toLocaleString() + "-" + maxSubs.toLocaleString() + " subscribers" });

  for (const ch of details.items || []) {
    const subs = Number(ch.statistics?.subscriberCount || 0);
    if (ch.statistics?.hiddenSubscriberCount) continue;
    if (subs < minSubs || subs > maxSubs) continue;
    found++;

    // Skip channels we already have before spending time scraping.
    const { data: existing } = await supabase.from("leads").select("id").eq("external_id", ch.id).maybeSingle();
    if (existing) continue;

    const desc = ch.snippet?.description || "";
    const descEmail = desc.match(EMAIL_RE);
    const website = pickWebsite(desc);
    // Free enrichment: if the description has no email but we found a
    // website, scrape it (homepage + /contact + /about) for one.
    let contactEmail = descEmail ? descEmail[0] : null;
    if (!contactEmail && website) {
      emit({ type: "status", msg: "Scraping site for " + (ch.snippet?.title || "creator") });
      try { contactEmail = await extractEmail(website); } catch (e) {}
    }

    let daysSinceUpload = null;
    const up = ch.contentDetails?.relatedPlaylists?.uploads;
    if (up) {
      try {
        const last = await yt("playlistItems", { part: "snippet", playlistId: up, maxResults: "1" });
        const pub = last.items?.[0]?.snippet?.publishedAt;
        if (pub) daysSinceUpload = Math.floor((Date.now() - new Date(pub).getTime()) / 86400000);
      } catch (e) {}
    }

    const signals = { subs, hasEmail: !!contactEmail, hasWebsite: !!website, hasLinks: !!(ch.snippet && ch.snippet.customUrl), uploadsCount: Number(ch.statistics?.videoCount || 0), topicMatch: true, longForm: true, daysSinceUpload };
    const scores = scoreCreator(signals);
    const g = gradeFor(scores.total);
    const reasons = [subs.toLocaleString() + " subscribers, in the sweet spot for Timbre", (signals.uploadsCount || 0) + " videos published, clear repurposing volume"];
    if (daysSinceUpload != null) reasons.push("Last upload " + daysSinceUpload + " days ago");
    const lead = { source: "youtube", external_id: ch.id, name: ch.snippet?.title || "Unknown channel", url: "https://www.youtube.com/channel/" + ch.id, segment, location: ch.snippet?.country || "", subs, contact_email: contactEmail, contact_link: website, fit_reasons: reasons, scores, score: scores.total, grade: g.grade, status: "New", enriched_at: contactEmail ? new Date().toISOString() : null };

    emit({ type: "scored", name: lead.name, subs, grade: lead.grade, score: lead.score });
    await sleep(120);
    const { data, error } = await supabase.from("leads").insert(lead).select().single();
    if (!error && data) { saved++; emit({ type: "lead", lead: data }); }
  }
  return { found, saved };
}

// The niches Timbre targets, used by the scheduled discovery job.
export const NICHE_QUERIES = [
  { segment: "Video creators", query: "video creator youtube channel" },
  { segment: "Tech YouTubers", query: "tech review youtube channel" },
  { segment: "Video editors", query: "video editing tutorial channel" },
  { segment: "Software / dev", query: "software developer youtube channel" },
  { segment: "Podcasters", query: "podcast clips highlights channel" },
  { segment: "Short makers", query: "shorts creator youtube channel" },
];
