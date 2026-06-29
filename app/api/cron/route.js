import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";
import { processQuery, NICHE_QUERIES } from "../../../lib/discovery";

// Scheduled discovery. Vercel Cron hits this with a GET. It walks the target
// niches, discovering + enriching leads, until it runs out of niches or hits
// the per-run time budget (serverless functions are time-limited).
export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds — Vercel Hobby ceiling

const TIME_BUDGET_MS = 50_000;

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
  try {
    const supabase = getSupabase();
    let totalFound = 0, totalSaved = 0;
    const perNiche = [];
    for (const niche of NICHE_QUERIES) {
      if (Date.now() - started > TIME_BUDGET_MS) break; // stop before the function times out
      try {
        const { found, saved } = await processQuery({
          supabase,
          query: niche.query,
          segment: niche.segment,
        });
        totalFound += found;
        totalSaved += saved;
        perNiche.push({ segment: niche.segment, found, saved });
      } catch (e) {
        perNiche.push({ segment: niche.segment, error: e.message });
      }
    }
    return NextResponse.json({ ok: true, ms: Date.now() - started, totalFound, totalSaved, perNiche });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
