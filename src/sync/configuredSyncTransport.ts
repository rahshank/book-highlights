import { createHttpSyncTransport } from "./httpSyncTransport";
import type { SyncTransport } from "./syncRunner";

export function createConfiguredSyncTransport(): SyncTransport | null {
  const env = import.meta.env;
  const apiBaseUrl = env.VITE_BOOK_HIGHLIGHTS_API_URL?.trim();
  const authToken = env.VITE_BOOK_HIGHLIGHTS_SYNC_TOKEN?.trim();

  if (!apiBaseUrl || !authToken) return null;

  return createHttpSyncTransport({
    apiBaseUrl,
    authToken,
  });
}
