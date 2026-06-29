import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";
import { scoreCreator, gradeFor } from "../../../lib/score";
import { extractEmail } from "../../../lib/extract";

// On-demand email enrichment for a single lead: scrape its website for a
// contact email, then re-score Reach. Free — uses plain fetch().
export async function POST(req) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const supabase = getSupabase();

    const { data: lead, error: readErr } = await supabase.from("leads").select("*").eq("id", id).single();
    if (readErr) throw new Error(readErr.message);

    const site = lead.contact_link || lead.url;
    if (!site) return NextResponse.json({ error: "No website on this lead to scrape." }, { status: 400 });

    const email = await extractEmail(site);
    if (!email) return NextResponse.json({ found: false, lead });

    // Re-score now that we have a reachable email.
    const prev = lead.scores || {};
    const signals = { subs: lead.subs || 0, hasEmail: true, hasWebsite: !!lead.contact_link, hasLinks: false };
    const reach = scoreCreator(signals).reach;
    const total = (prev.fit || 0) + reach + (prev.need || 0) + (prev.timing || 0);
    const scores = { ...prev, reach, total };
    const g = gradeFor(total);

    const { data, error } = await supabase
      .from("leads")
      .update({ contact_email: email, scores, score: total, grade: g.grade })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ found: true, lead: data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
