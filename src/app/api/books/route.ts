import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/books — list all books with highlight counts
export async function GET() {
  const { data: books, error } = await supabase
    .from("books")
    .select("*, highlights(count)")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = books.map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    isbn: b.isbn,
    cover_url: b.cover_url,
    source: b.source,
    created_at: b.created_at,
    highlight_count: b.highlights?.[0]?.count ?? 0,
  }));

  return NextResponse.json(result);
}

// POST /api/books — create a book
export async function POST(req: NextRequest) {
  const body = await req.json();

  const { data, error } = await supabase
    .from("books")
    .insert({
      title: body.title,
      author: body.author ?? "",
      isbn: body.isbn ?? "",
      cover_url: body.cover_url ?? "",
      publisher: body.publisher ?? "",
      year: body.year ?? "",
      source: body.source ?? "manual",
      notes: body.notes ?? "",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ...data, highlights: [] }, { status: 201 });
}
