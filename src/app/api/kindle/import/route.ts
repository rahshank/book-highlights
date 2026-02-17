import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { parseClippings, groupByBook } from "@/lib/kindle-parser";

// POST /api/kindle/import — import Kindle My Clippings.txt
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const content = await file.text();
  const clippings = parseClippings(content);
  const books = groupByBook(clippings);

  const results = [];

  for (const kindleBook of books) {
    // Find or create book
    let bookId: string;
    const { data: existing } = await supabase
      .from("books")
      .select("id")
      .eq("title", kindleBook.title)
      .eq("author", kindleBook.author)
      .single();

    if (existing) {
      bookId = existing.id;
    } else {
      const { data: newBook, error } = await supabase
        .from("books")
        .insert({ title: kindleBook.title, author: kindleBook.author, source: "kindle" })
        .select("id")
        .single();
      if (error || !newBook) continue;
      bookId = newBook.id;
    }

    // Get existing highlights for dedup
    const { data: existingHighlights } = await supabase
      .from("highlights")
      .select("text")
      .eq("book_id", bookId);
    const existingTexts = new Set((existingHighlights ?? []).map((h) => h.text));

    // Insert new highlights (skip bookmarks and duplicates)
    let newCount = 0;
    for (const clip of kindleBook.clippings) {
      if (clip.clippingType === "bookmark") continue;
      if (existingTexts.has(clip.text)) continue;

      const isNote = clip.clippingType === "note";
      const { error } = await supabase.from("highlights").insert({
        book_id: bookId,
        text: isNote ? "" : clip.text,
        note: isNote ? clip.text : "",
        page_number: clip.page,
        location: clip.location,
        source: "kindle",
      });

      if (!error) {
        existingTexts.add(clip.text);
        newCount++;
      }
    }

    results.push({
      id: bookId,
      title: kindleBook.title,
      author: kindleBook.author,
      isbn: "",
      cover_url: "",
      source: "kindle",
      created_at: new Date().toISOString(),
      highlight_count: newCount,
    });
  }

  return NextResponse.json(results);
}
