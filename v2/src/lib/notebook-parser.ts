export interface NotebookHighlight {
  text: string;
  page: number | null;
  location: string;
  color: string;
  note: string;
}

export interface NotebookParseResult {
  title: string;
  author: string;
  highlights: NotebookHighlight[];
}

const HIGHLIGHT_RE =
  /^(?:(?:Yellow|Blue|Pink|Orange)\s+highlight|Highlight\s*\((?:Yellow|Blue|Pink|Orange)\))\s*\|?\s*(.*)$/i;
const NOTE_RE = /^Note\s*[|\-]\s*(.*)$/i;
const PAGE_RE = /page:?\s*(\d+)/i;
const LOCATION_RE = /location:?\s*([\d\-]+)/i;

const NOISE_PHRASES = [
  "notebook export",
  "your notes and highlights",
  "kindle",
  "free kindle",
  "buy the kindle",
  "last annotated on",
  "annotations",
];

export function parseNotebookPaste(
  text: string,
  titleOverride = "",
  authorOverride = "",
): NotebookParseResult {
  const lines = text.trim().split("\n");
  if (!lines.length) {
    return { title: titleOverride, author: authorOverride, highlights: [] };
  }

  const { title: detected, author: detectedAuthor, contentStart } = extractHeader(lines);
  const title = titleOverride || detected;
  const author = authorOverride || detectedAuthor;
  const highlights = parseEntries(lines.slice(contentStart));

  return { title, author, highlights };
}

function extractHeader(lines: string[]): {
  title: string;
  author: string;
  contentStart: number;
} {
  const preamble: string[] = [];
  let contentStart = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (HIGHLIGHT_RE.test(stripped) || NOTE_RE.test(stripped)) {
      contentStart = i;
      break;
    }
    preamble.push(stripped);
  }

  const clean = preamble.filter((l) => l && !isNoiseLine(l));

  let title = "";
  let author = "";

  if (clean.length >= 2) {
    title = clean[0];
    author = clean[1];
    if (author.toLowerCase().startsWith("by ")) {
      author = author.slice(3).trim();
    }
  } else if (clean.length === 1) {
    title = clean[0];
  }

  return { title, author, contentStart };
}

function isNoiseLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  return NOISE_PHRASES.some((p) => lower.includes(p));
}

function parseEntries(lines: string[]): NotebookHighlight[] {
  const highlights: NotebookHighlight[] = [];
  let current: NotebookHighlight | null = null;
  let currentType = "";
  let textLines: string[] = [];

  function flush() {
    if (!current) return;
    const joined = textLines.join("\n").trim();
    if (currentType === "note") {
      if (highlights.length > 0 && joined) {
        highlights[highlights.length - 1].note = joined;
      }
    } else {
      current.text = joined;
      if (joined) highlights.push(current);
    }
    current = null;
    textLines = [];
  }

  for (const line of lines) {
    const stripped = line.trim();

    const hMatch = stripped.match(HIGHLIGHT_RE);
    if (hMatch) {
      flush();
      const meta = hMatch[1];
      const { page, location } = extractPageLocation(meta);
      const color = extractColor(stripped);
      current = { text: "", page, location, color, note: "" };
      currentType = "highlight";
      textLines = [];
      continue;
    }

    const nMatch = stripped.match(NOTE_RE);
    if (nMatch) {
      flush();
      const meta = nMatch[1];
      const { page, location } = extractPageLocation(meta);
      current = { text: "", page, location, color: "", note: "" };
      currentType = "note";
      textLines = [];
      continue;
    }

    if (current !== null) {
      textLines.push(line.trimEnd());
    }
  }

  flush();
  return highlights;
}

function extractPageLocation(meta: string): { page: number | null; location: string } {
  const pageMatch = meta.match(PAGE_RE);
  const locMatch = meta.match(LOCATION_RE);
  return {
    page: pageMatch ? parseInt(pageMatch[1], 10) : null,
    location: locMatch ? locMatch[1] : "",
  };
}

function extractColor(line: string): string {
  const lower = line.toLowerCase();
  for (const color of ["yellow", "blue", "pink", "orange"]) {
    if (lower.includes(color)) return color;
  }
  return "";
}
