import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parseNotebookPaste } from "@/lib/notebook-parser";

// POST /api/kindle/import-notebook — import pasted Kindle Notebook highlights
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { text, title: titleOverride, author: authorOverride } = body;

  if (!text?.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const parsed = parseNotebookPaste(text, titleOverride ?? "", authorOverride ?? "");

  if (!parsed.title) {
    return NextResponse.json(
      { error: "Could not detect book title. Please provide one." },
      { status: 400 },
    );
  }

  // Find or create book
  let bookId: string;
  const { data: existing } = await supabase
    .from("books")
    .select("id")
    .eq("title", parsed.title)
    .eq("author", parsed.author)
    .single();

  if (existing) {
    bookId = existing.id;
  } else {
    const { data: newBook, error } = await supabase
      .from("books")
      .insert({ title: parsed.title, author: parsed.author, source: "kindle" })
      .select("id")
      .single();
    if (error || !newBook) {
      return NextResponse.json({ error: "Failed to create book" }, { status: 500 });
    }
    bookId = newBook.id;
  }

  // Get existing highlights for dedup
  const { data: existingHighlights } = await supabase
    .from("highlights")
    .select("text")
    .eq("book_id", bookId);
  const existingTexts = new Set((existingHighlights ?? []).map((h) => h.text));

  // Insert new highlights
  let newCount = 0;
  const seenInPaste = new Set<string>();

  for (const h of parsed.highlights) {
    if (!h.text || existingTexts.has(h.text) || seenInPaste.has(h.text)) continue;

    const { error } = await supabase.from("highlights").insert({
      book_id: bookId,
      text: h.text,
      note: h.note ?? "",
      page_number: h.page,
      location: h.location,
      source: "kindle",
    });

    if (!error) {
      existingTexts.add(h.text);
      seenInPaste.add(h.text);
      newCount++;
    }
  }

  return NextResponse.json({
    id: bookId,
    title: parsed.title,
    author: parsed.author,
    isbn: "",
    cover_url: "",
    source: "kindle",
    created_at: new Date().toISOString(),
    highlight_count: newCount,
  });
}
