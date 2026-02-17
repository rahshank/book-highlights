import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/books/:id — single book with all highlights
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const { data: book, error } = await supabase
    .from("books")
    .select("*, highlights(*)")
    .eq("id", id)
    .single();

  if (error || !book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  return NextResponse.json(book);
}

// PATCH /api/books/:id — update book metadata
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  for (const key of ["title", "author", "isbn", "cover_url", "publisher", "year", "notes"]) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  const { data, error } = await supabase
    .from("books")
    .update(updates)
    .eq("id", id)
    .select("*, highlights(*)")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

// DELETE /api/books/:id — delete book (cascades highlights)
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;

  const { error } = await supabase.from("books").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
