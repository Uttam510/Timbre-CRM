import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";
import { processQuery, NICHE_QUERIES } from "../../../lib/discovery";

// Scheduled discovery. Triggered hourly (Vercel Cron or an external scheduler
// like cron-job.org). External free schedulers cap requests at ~30s, so each
// run is bounded to TIME_BUDGET_MS and processes only a rotating slice of the
// niches — over 24 hourly runs every niche is covered several times.
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — Vercel Hobby ceiling

const TIME_BUDGET_MS = 22_000; // finish well under a 30s external timeout
const NICHES_PER_RUN = 2;      // rotated each run; the rest run on later hours
const MAX_SCRAPE_PER_NICHE = 6; // hard cap on slow site scrapes per niche

export async function GET(req) {
  // When CRON_SECRET is set, require it (Vercel sends it automatically on cron).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const started = Date.now();
  const deadline = started + TIME_BUDGET_MS;
  // Rotate which niches run this hour so all six get covered across the day.
  const offset = (new Date().getUTCHours() * NICHES_PER_RUN) % NICHE_QUERIES.length;
  const slice = Array.from({ length: NICHES_PER_RUN }, (_, i) => NICHE_QUERIES[(offset + i) % NICHE_QUERIES.length]);

  try {
    const supabase = getSupabase();
    let totalFound = 0, totalSaved = 0;
    const perNiche = [];
    for (const niche of slice) {
      if (Date.now() > deadline) break; // stop before the external timeout
      try {
        const { found, saved } = await processQuery({
          supabase,
          query: niche.query,
          segment: niche.segment,
          deadline,
          maxScrape: MAX_SCRAPE_PER_NICHE,
        });
        totalFound += found;
        totalSaved += saved;
        perNiche.push({ segment: niche.segment, found, saved });
      } catch (e) {
        perNiche.push({ segment: niche.segment, error: e.message });
      }
    }
    return NextResponse.json({ ok: true, ms: Date.now() - started, niches: slice.map((n) => n.segment), totalFound, totalSaved, perNiche });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
