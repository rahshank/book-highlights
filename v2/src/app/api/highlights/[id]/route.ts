import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/highlights/:id — update highlight
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  for (const key of ["text", "note", "page_number", "location", "chapter"]) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from("highlights")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// DELETE /api/highlights/:id
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const { error } = await supabase.from("highlights").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
