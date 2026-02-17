import { NextRequest, NextResponse } from "next/server";

type Ctx = { params: Promise<{ isbn: string }> };

// GET /api/isbn/:isbn — look up book metadata by ISBN
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { isbn: rawIsbn } = await params;
  const isbn = rawIsbn.replace(/[-\s]/g, "");

  if (!isbn) {
    return NextResponse.json({ error: "Invalid ISBN" }, { status: 400 });
  }

  // Try Open Library first
  const result = await lookupOpenLibrary(isbn);
  if (result) return NextResponse.json(result);

  return NextResponse.json({ error: "ISBN not found" }, { status: 404 });
}

async function lookupOpenLibrary(isbn: string) {
  try {
    const res = await fetch(`https://openlibrary.org/isbn/${isbn}.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json();

    const title = data.title ?? "";
    const publishDate = data.publish_date ?? "";
    const year = publishDate.includes(",")
      ? publishDate.split(",").pop()!.trim()
      : publishDate.trim();

    // Resolve authors
    let authorRefs: { key?: string }[] = data.authors ?? [];
    if (!authorRefs.length) {
      for (const workRef of data.works ?? []) {
        const workKey = workRef.key;
        if (!workKey) continue;
        try {
          const workRes = await fetch(`https://openlibrary.org${workKey}.json`, {
            signal: AbortSignal.timeout(10_000),
          });
          const work = await workRes.json();
          authorRefs = (work.authors ?? []).map(
            (r: { author?: { key?: string }; key?: string }) => r.author ?? r,
          );
        } catch {
          // ignore
        }
        break;
      }
    }

    const authors: string[] = [];
    for (const ref of authorRefs) {
      if (!ref.key) continue;
      try {
        const aRes = await fetch(`https://openlibrary.org${ref.key}.json`, {
          signal: AbortSignal.timeout(10_000),
        });
        const a = await aRes.json();
        if (a.name) authors.push(a.name);
      } catch {
        // ignore
      }
    }

    const covers: number[] = data.covers ?? [];
    const coverUrl = covers.length
      ? `https://covers.openlibrary.org/b/id/${covers[0]}-M.jpg`
      : "";

    return {
      title,
      author: authors.join(", "),
      publisher: (data.publishers ?? []).join(", "),
      year,
      isbn,
      cover_url: coverUrl,
    };
  } catch {
    return null;
  }
}
