import type { BookSummary } from "@/lib/types";
import HomeClient from "./HomeClient";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function getBooks(): Promise<BookSummary[]> {
  const { data: books, error } = await supabase
    .from("books")
    .select("*, highlights(count)")
    .order("created_at", { ascending: false });

  if (error || !books) return [];

  return books.map((b) => ({
    id: b.id,
    title: b.title,
    author: b.author,
    isbn: b.isbn,
    cover_url: b.cover_url,
    source: b.source,
    created_at: b.created_at,
    highlight_count: b.highlights?.[0]?.count ?? 0,
  }));
}

export default async function HomePage() {
  const books = await getBooks();
  return <HomeClient initialBooks={books} />;
}
