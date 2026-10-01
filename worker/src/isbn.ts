import { json } from "./types";
// Only the fixed Open Library search endpoint is fetched; input cannot become a URL.
export async function lookupIsbn(raw: string, call: typeof fetch = fetch) {
  const isbn = raw.replace(/[\s-]/g, "").toUpperCase();
  if (!/^(?:\d{9}[\dX]|\d{13})$/.test(isbn))
    return json({ error: "Enter a 10- or 13-digit ISBN." }, 400);
  try {
    const response = await call(
      "https://openlibrary.org/search.json?" +
        new URLSearchParams({
          q: "isbn:" + isbn,
          limit: "1",
          fields: "title,author_name",
        }),
      {
        headers: {
          "User-Agent": "BookHighlights/1.0 (private reading library)",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("Lookup unavailable: " + response.status);
    const data = (await response.json()) as {
      docs?: Array<{ title?: string; author_name?: string[] }>;
    };
    const book = data.docs?.[0];
    if (!book?.title)
      return json(
        {
          error:
            "No book found for this ISBN. You can enter the details yourself.",
        },
        404,
      );
    return json({
      isbn,
      title: book.title.slice(0, 500),
      author: (book.author_name ?? []).join(", ").slice(0, 500),
    });
  } catch (error) {
    console.warn(
      "ISBN lookup failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json(
      {
        error:
          "Book lookup is unavailable. You can enter the details yourself.",
      },
      503,
    );
  }
}
