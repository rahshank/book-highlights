-- Run this in the Supabase SQL Editor to create the tables

CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  author VARCHAR(500) DEFAULT '',
  isbn VARCHAR(20) DEFAULT '',
  cover_url VARCHAR(1000) DEFAULT '',
  publisher VARCHAR(500) DEFAULT '',
  year VARCHAR(10) DEFAULT '',
  source VARCHAR(50) DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_books_isbn ON books(isbn);

CREATE TABLE IF NOT EXISTS highlights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  note TEXT DEFAULT '',
  page_number INTEGER,
  location VARCHAR(100) DEFAULT '',
  chapter VARCHAR(500) DEFAULT '',
  source VARCHAR(50) DEFAULT 'manual',
  source_image VARCHAR(1000) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_highlights_book_id ON highlights(book_id);
CREATE INDEX IF NOT EXISTS idx_highlights_created_at ON highlights(created_at);
