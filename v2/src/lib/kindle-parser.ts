export interface KindleClipping {
  bookTitle: string;
  author: string;
  text: string;
  page: number | null;
  location: string;
  clippingType: "highlight" | "note" | "bookmark";
}

export interface KindleBook {
  title: string;
  author: string;
  clippings: KindleClipping[];
}

export function parseClippings(content: string): KindleClipping[] {
  const clippings: KindleClipping[] = [];
  const blocks = content.split("==========");

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split("\n");
    if (lines.length < 3) continue;

    const [title, author] = parseTitleAuthor(lines[0].trim());
    const { page, location, clippingType } = parseMetadata(lines[1].trim());

    const textLines = lines.slice(2).filter((l) => l.trim());
    const text = textLines.join("\n").trim();

    if (!text && clippingType === "highlight") continue;

    clippings.push({ bookTitle: title, author, text, page, location, clippingType });
  }

  return clippings;
}

export function groupByBook(clippings: KindleClipping[]): KindleBook[] {
  const books = new Map<string, KindleBook>();

  for (const clip of clippings) {
    const key = `${clip.bookTitle}||${clip.author}`;
    if (!books.has(key)) {
      books.set(key, { title: clip.bookTitle, author: clip.author, clippings: [] });
    }
    books.get(key)!.clippings.push(clip);
  }

  return Array.from(books.values());
}

function parseTitleAuthor(line: string): [string, string] {
  const match = line.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) return [match[1].trim(), match[2].trim()];
  return [line.trim(), ""];
}

function parseMetadata(line: string): {
  page: number | null;
  location: string;
  clippingType: "highlight" | "note" | "bookmark";
} {
  let clippingType: "highlight" | "note" | "bookmark" = "highlight";
  if (/Your Note/i.test(line)) clippingType = "note";
  else if (/Your Bookmark/i.test(line)) clippingType = "bookmark";

  const pageMatch = line.match(/page\s+(\d+)/i);
  const locMatch = line.match(/location\s+([\d-]+)/i);

  return {
    page: pageMatch ? parseInt(pageMatch[1], 10) : null,
    location: locMatch ? locMatch[1] : "",
    clippingType,
  };
}
