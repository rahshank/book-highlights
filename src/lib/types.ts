export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  cover_url: string;
  publisher: string;
  year: string;
  source: string;
  created_at: string;
  notes: string;
}

export interface BookSummary {
  id: string;
  title: string;
  author: string;
  isbn: string;
  cover_url: string;
  source: string;
  created_at: string;
  highlight_count: number;
}

export interface BookWithHighlights extends Book {
  highlights: Highlight[];
}

export interface Highlight {
  id: string;
  book_id: string;
  text: string;
  note: string;
  page_number: number | null;
  location: string;
  chapter: string;
  source: string;
  source_image: string;
  created_at: string;
}

export interface SearchResult {
  highlight: Highlight;
  book_title: string;
  book_author: string;
}

export interface ScanResult {
  text: string;
  source_image: string;
  detected_page: number | null;
}
