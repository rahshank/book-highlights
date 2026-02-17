import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET /api/highlights/search?q=... — search highlights by text/note
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";

  if (!q.trim()) {
    return NextResponse.json([]);
  }

  const pattern = `%${q}%`;

  const { data: highlights, error } = await supabase
    .from("highlights")
    .select("*, books!inner(title, author)")
    .or(`text.ilike.${pattern},note.ilike.${pattern}`)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = highlights.map((h) => {
    const { books, ...highlight } = h;
    return {
      highlight,
      book_title: (books as { title: string; author: string }).title,
      book_author: (books as { title: string; author: string }).author,
    };
  });

  return NextResponse.json(result);
}
