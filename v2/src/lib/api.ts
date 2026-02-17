import type {
  BookSummary,
  BookWithHighlights,
  Highlight,
  SearchResult,
  ScanResult,
} from "./types";

const API_BASE = "/api";

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function getBooks(): Promise<BookSummary[]> {
  return fetchJSON(`${API_BASE}/books`);
}

export async function getBook(id: string): Promise<BookWithHighlights> {
  return fetchJSON(`${API_BASE}/books/${id}`);
}

export async function createBook(data: {
  title: string;
  author?: string;
  isbn?: string;
}): Promise<BookWithHighlights> {
  return fetchJSON(`${API_BASE}/books`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteBook(id: string): Promise<void> {
  return fetchJSON(`${API_BASE}/books/${id}`, { method: "DELETE" });
}

export async function createHighlight(data: {
  book_id: string;
  text: string;
  note?: string;
  page_number?: number;
  source?: string;
  source_image?: string;
}): Promise<Highlight> {
  return fetchJSON(`${API_BASE}/highlights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function scanPagePhoto(file: File): Promise<ScanResult> {
  const form = new FormData();
  form.append("photo", file);
  return fetchJSON(`${API_BASE}/highlights/scan`, {
    method: "POST",
    body: form,
  });
}

export async function deleteHighlight(id: string): Promise<void> {
  return fetchJSON(`${API_BASE}/highlights/${id}`, { method: "DELETE" });
}

export async function updateHighlight(
  id: string,
  data: { text?: string; note?: string; page_number?: number | null },
): Promise<Highlight> {
  return fetchJSON(`${API_BASE}/highlights/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function searchHighlights(query: string): Promise<SearchResult[]> {
  return fetchJSON(`${API_BASE}/highlights/search?q=${encodeURIComponent(query)}`);
}

export async function importKindle(file: File): Promise<BookSummary[]> {
  const form = new FormData();
  form.append("file", file);
  return fetchJSON(`${API_BASE}/kindle/import`, {
    method: "POST",
    body: form,
  });
}

export async function importNotebookPaste(data: {
  text: string;
  title?: string;
  author?: string;
}): Promise<BookSummary> {
  return fetchJSON(`${API_BASE}/kindle/import-notebook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function lookupISBN(isbn: string): Promise<{
  title: string;
  author: string;
  publisher: string;
  year: string;
  isbn: string;
  cover_url: string;
}> {
  return fetchJSON(`${API_BASE}/isbn/${isbn}`);
}

export async function publishHighlights(
  bookId: string,
  target: "ghost" | "roam",
): Promise<{ url?: string; status?: string; page_title?: string }> {
  return fetchJSON(`${API_BASE}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_id: bookId, target }),
  });
}
