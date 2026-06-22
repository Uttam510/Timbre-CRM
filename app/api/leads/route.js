import { NextResponse } from "next/server";
import { getSupabase } from "../../../lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("leads").select("*").order("score", { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ leads: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e.message, leads: [] }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const supabase = getSupabase();
    const { data, error } = await supabase.from("leads").update(fields).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ lead: data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
