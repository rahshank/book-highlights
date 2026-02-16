import type { BookSummary } from "@/lib/api";
import HomeClient from "./HomeClient";

const BACKEND = process.env.API_URL || "http://backend:8000";

export const dynamic = "force-dynamic";

async function getBooks(): Promise<BookSummary[]> {
  const res = await fetch(`${BACKEND}/api/books`);
  if (!res.ok) return [];
  return res.json();
}

export default async function HomePage() {
  const books = await getBooks();
  return <HomeClient initialBooks={books} />;
}
