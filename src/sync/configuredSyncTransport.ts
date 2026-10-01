import { createHttpSyncTransport } from "./httpSyncTransport";
export function createConfiguredSyncTransport() {
  return createHttpSyncTransport({ apiBaseUrl: "" });
}
