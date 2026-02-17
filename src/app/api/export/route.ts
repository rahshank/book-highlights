import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/export — download all books and highlights as JSON
export async function GET() {
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  if (booksError) {
    return NextResponse.json({ error: booksError.message }, { status: 500 });
  }

  const { data: highlights, error: highlightsError } = await supabase
    .from("highlights")
    .select("*")
    .order("created_at", { ascending: true });

  if (highlightsError) {
    return NextResponse.json({ error: highlightsError.message }, { status: 500 });
  }

  const highlightsByBook = new Map<string, typeof highlights>();
  for (const h of highlights) {
    const list = highlightsByBook.get(h.book_id) ?? [];
    list.push(h);
    highlightsByBook.set(h.book_id, list);
  }

  const exported = {
    exported_at: new Date().toISOString(),
    books: books.map((b) => ({
      title: b.title,
      author: b.author,
      isbn: b.isbn,
      cover_url: b.cover_url,
      publisher: b.publisher,
      year: b.year,
      source: b.source,
      notes: b.notes,
      created_at: b.created_at,
      highlights: (highlightsByBook.get(b.id) ?? []).map((h) => ({
        text: h.text,
        note: h.note,
        page_number: h.page_number,
        location: h.location,
        chapter: h.chapter,
        source: h.source,
        created_at: h.created_at,
      })),
    })),
  };

  const filename = `book-highlights-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exported, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
