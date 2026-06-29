import { getSupabase } from "../../../lib/supabase";
import { processQuery } from "../../../lib/discovery";

export async function POST(req) {
  const body = await req.json();
  const query = (body.query || "").trim();
  const minSubs = Number(body.minSubs ?? 5000);
  const maxSubs = Number(body.maxSubs ?? 200000);
  const segment = body.segment || "";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const supabase = getSupabase();
        const { found, saved } = await processQuery({ supabase, query, segment, minSubs, maxSubs, emit: send });
        send({ type: "done", found, saved });
      } catch (e) {
        send({ type: "error", msg: e.message });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
