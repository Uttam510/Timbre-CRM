import { getSupabase } from "../../../lib/supabase";
import { scoreCreator, gradeFor } from "../../../lib/score";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function yt(path, params) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("Set YOUTUBE_API_KEY in your environment.");
  const url = new URL("https://www.googleapis.com/youtube/v3/" + path);
  Object.entries({ ...params, key }).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "YouTube API error");
  return data;
}

export async function POST(req) {
  const body = await req.json();
  const query = (body.query || "").trim();
  const minSubs = Number(body.minSubs ?? 5000);
  const maxSubs = Number(body.maxSubs ?? 200000);
  const segment = body.segment || "";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\\n"));
      try {
        if (!query) throw new Error("A search query is required.");
        const supabase = getSupabase();
        send({ type: "status", msg: "Searching YouTube for " + query });
        const search = await yt("search", { part: "snippet", type: "channel", q: query, maxResults: "20" });
        const ids = (search.items || []).map((i) => i.snippet?.channelId || i.id?.channelId).filter(Boolean);
        send({ type: "status", msg: "Found " + ids.length + " channels" });
        if (ids.length === 0) { send({ type: "done", found: 0, saved: 0 }); controller.close(); return; }
        send({ type: "status", msg: "Pulling channel details" });
        const details = await yt("channels", { part: "snippet,statistics,contentDetails", id: ids.join(",") });
        send({ type: "status", msg: "Filtering to " + minSubs.toLocaleString() + "-" + maxSubs.toLocaleString() + " subscribers" });
        let saved = 0, found = 0;
        for (const ch of details.items || []) {
          const subs = Number(ch.statistics?.subscriberCount || 0);
          if (ch.statistics?.hiddenSubscriberCount) continue;
          if (subs < minSubs || subs > maxSubs) continue;
          found++;
          const desc = ch.snippet?.description || "";
          const emailMatch = desc.match(EMAIL_RE);
          const linkMatch = desc.match(/https?:\/\/[^\s)]+/);
          let daysSinceUpload = null;
          const up = ch.contentDetails?.relatedPlaylists?.uploads;
          if (up) { try { const last = await yt("playlistItems", { part: "snippet", playlistId: up, maxResults: "1" }); const pub = last.items?.[0]?.snippet?.publishedAt; if (pub) daysSinceUpload = Math.floor((Date.now() - new Date(pub).getTime()) / 86400000); } catch (e) {} }
          const signals = { subs, hasEmail: !!emailMatch, hasWebsite: !!linkMatch, hasLinks: !!(ch.snippet && ch.snippet.customUrl), uploadsCount: Number(ch.statistics?.videoCount || 0), topicMatch: true, longForm: true, daysSinceUpload };
          const scores = scoreCreator(signals);
          const g = gradeFor(scores.total);
          const reasons = [subs.toLocaleString() + " subscribers, in the sweet spot for Timbre", (signals.uploadsCount || 0) + " videos published, clear repurposing volume"];
          if (daysSinceUpload != null) reasons.push("Last upload " + daysSinceUpload + " days ago");
          const lead = { source: "youtube", external_id: ch.id, name: ch.snippet?.title || "Unknown channel", url: "https://www.youtube.com/channel/" + ch.id, segment, location: ch.snippet?.country || "", subs, contact_email: emailMatch ? emailMatch[0] : null, contact_link: linkMatch ? linkMatch[0] : null, fit_reasons: reasons, scores, score: scores.total, grade: g.grade, status: "New" };
          send({ type: "scored", name: lead.name, subs, grade: lead.grade, score: lead.score });
          await sleep(180);
          const { data: existing } = await supabase.from("leads").select("id").eq("external_id", ch.id).maybeSingle();
          if (existing) continue;
          const { data, error } = await supabase.from("leads").insert(lead).select().single();
          if (!error && data) { saved++; send({ type: "lead", lead: data }); }
        }
        send({ type: "done", found, saved });
        controller.close();
      } catch (e) { send({ type: "error", msg: e.message }); controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
