create table if not exists books (
  id text primary key,
  title text not null,
  author text not null default '',
  isbn text not null default '',
  cover_url text not null default '',
  publisher text not null default '',
  year text not null default '',
  source text not null default 'manual',
  notes text not null default '',
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1
);

create table if not exists highlights (
  id text primary key,
  book_id text not null references books(id),
  text text not null,
  note text not null default '',
  page_number integer,
  location text not null default '',
  chapter text not null default '',
  source text not null default 'manual',
  source_image text not null default '',
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  version integer not null default 1
);

create table if not exists sync_events (
  id text primary key,
  operation_id text not null,
  entity text not null,
  entity_id text not null,
  action text not null,
  payload_json text not null default '{}',
  client_cursor text not null default '',
  created_at text not null
);

create table if not exists devices (
  id text primary key,
  name text not null default '',
  token_hash text not null,
  created_at text not null,
  last_seen_at text
);

create index if not exists idx_books_updated_at on books(updated_at);
create index if not exists idx_books_deleted_at on books(deleted_at);
create index if not exists idx_highlights_book_id on highlights(book_id);
create index if not exists idx_highlights_updated_at on highlights(updated_at);
create index if not exists idx_highlights_deleted_at on highlights(deleted_at);
create index if not exists idx_sync_events_created_at on sync_events(created_at);
