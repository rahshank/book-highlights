import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/highlights — list highlights, optionally filtered by book_id
export async function GET(req: NextRequest) {
  const bookId = req.nextUrl.searchParams.get("book_id");

  let query = supabase
    .from("highlights")
    .select("*")
    .order("created_at", { ascending: false });

  if (bookId) {
    query = query.eq("book_id", bookId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/highlights — create a highlight
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Verify book exists
  const { data: book } = await supabase
    .from("books")
    .select("id")
    .eq("id", body.book_id)
    .single();

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("highlights")
    .insert({
      book_id: body.book_id,
      text: body.text,
      note: body.note ?? "",
      page_number: body.page_number ?? null,
      location: body.location ?? "",
      chapter: body.chapter ?? "",
      source: body.source ?? "manual",
      source_image: body.source_image ?? "",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
