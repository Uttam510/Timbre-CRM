import { getSupabase } from "../../../lib/supabase";
import { locationLabel } from "../../../lib/location";

// Export the leads dataset as CSV (default) or JSON.
//   /api/export                      -> all leads, CSV
//   /api/export?withEmail=1          -> only leads that have an email
//   /api/export?format=json          -> JSON instead of CSV
export const dynamic = "force-dynamic";

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// [field on the lead row, column header in the export]
const COLUMNS = [
  ["name", "Name"],
  ["url", "Channel URL"],
  ["subs", "Subscribers"],
  ["segment", "Niche"],
  ["country_code", "Country code"],
  ["country", "Country"],
  ["contact_email", "Email"],
  ["contact_link", "Website"],
  ["score", "Score"],
  ["grade", "Grade"],
  ["status", "Status"],
  ["created_at", "Discovered at"],
  ["enriched_at", "Email found at"],
];

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const withEmail = searchParams.get("withEmail") === "1";
    const format = (searchParams.get("format") || "csv").toLowerCase();

    const supabase = getSupabase();
    let q = supabase.from("leads").select("*").order("score", { ascending: false });
    if (withEmail) q = q.not("contact_email", "is", null);
    const { data, error } = await q;
    if (error) throw new Error(error.message);

    // Flatten into export-friendly rows (split the raw country code from the label).
    const rows = (data || []).map((l) => ({
      ...l,
      country_code: l.location || "",
      country: l.location ? locationLabel(l.location) : "",
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    const base = withEmail ? "timbre-emails" : "timbre-leads";

    if (format === "json") {
      const picked = rows.map((r) => Object.fromEntries(COLUMNS.map(([k]) => [k, r[k] ?? null])));
      return new Response(JSON.stringify(picked, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${base}-${stamp}.json"`,
        },
      });
    }

    const header = COLUMNS.map(([, label]) => label).join(",");
    const lines = rows.map((r) => COLUMNS.map(([k]) => csvCell(r[k])).join(","));
    const csv = [header, ...lines].join("\n");
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}-${stamp}.csv"`,
      },
    });
  } catch (e) {
    return new Response("error: " + e.message, { status: 500 });
  }
}
