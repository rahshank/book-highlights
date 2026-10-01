import type { D1Database, R2Bucket, Fetcher } from "@cloudflare/workers-types";
export interface WorkerEnv {
  DB: D1Database;
  SCAN_IMAGES: R2Bucket;
  ASSETS?: Fetcher;
  OWNER_EMAIL: string;
  APP_ORIGIN?: string;
  BETTER_AUTH_SECRET?: string;
  SHARED_AUTH_ORIGIN?: string;
  SHARED_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}
export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
export async function digest(value: string | ArrayBuffer) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function limitedBody(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max)
    throw new Error("Request too large");
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  let total = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new Error("Request too large");
    }
    parts.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return body;
}
export async function rateLimit(
  env: WorkerEnv,
  key: string,
  max: number,
  seconds: number,
) {
  const slot = Math.floor(Date.now() / 1000 / seconds);
  const row = await env.DB.prepare(
    "insert into request_limits(id,count,expires) values(?,1,?) on conflict(id) do update set count=count+1 returning count",
  )
    .bind(key + ":" + slot, (slot + 2) * seconds)
    .first<{ count: number }>();
  return Boolean(row && row.count <= max);
}
