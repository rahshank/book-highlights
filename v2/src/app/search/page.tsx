"use client";

import { useState } from "react";
import Link from "next/link";
import { searchHighlights } from "@/lib/api";
import type { SearchResult } from "@/lib/types";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      const data = await searchHighlights(query.trim());
      setResults(data);
      setSearched(true);
    } catch {
      setResults([]);
      setSearched(true);
    }
  }

  return (
    <>
      <h1>Search Highlights</h1>
      <form onSubmit={handleSearch} className="search-bar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search across all your highlights and notes..."
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ marginTop: "0.5rem" }}
        >
          Search
        </button>
      </form>

      {searched && results.length === 0 && (
        <div className="empty">
          <p>No highlights found matching &ldquo;{query}&rdquo;</p>
        </div>
      )}

      {results.map((r) => (
        <div key={r.highlight.id} className="highlight-card">
          <div style={{ marginBottom: "0.5rem" }}>
            <Link href={`/books/${r.highlight.book_id}`}>
              <strong>{r.book_title}</strong>
              {r.book_author && <span style={{ color: "var(--muted)" }}> by {r.book_author}</span>}
            </Link>
          </div>
          {r.highlight.text && (
            <div className="text">&ldquo;{r.highlight.text}&rdquo;</div>
          )}
          {r.highlight.note && <div className="note">Note: {r.highlight.note}</div>}
          <div className="meta">
            {[
              r.highlight.page_number ? `Page ${r.highlight.page_number}` : null,
              r.highlight.location ? `Location ${r.highlight.location}` : null,
            ]
              .filter(Boolean)
              .join(" \u00b7 ")}
          </div>
        </div>
      ))}
    </>
  );
}
