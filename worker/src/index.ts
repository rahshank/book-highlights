import { authenticated, authRoute } from "./auth";
import { push, pull } from "./sync";
import { scan } from "./ocr";
import { lookupIsbn } from "./isbn";
import { json, limitedBody, type WorkerEnv } from "./types";
export type { WorkerEnv } from "./types";
export default { fetch: handleRequest };
export async function handleRequest(
  request: Request,
  env: WorkerEnv,
): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (!url.pathname.startsWith("/api/")) {
      if (!env.ASSETS) return new Response("Not found", { status: 404 });
      const r = await env.ASSETS.fetch(request as never);
      const response = new Response(
        r.body as ReadableStream,
        r as unknown as Response,
      );
      response.headers.set("X-Content-Type-Options", "nosniff");
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set("X-Frame-Options", "DENY");
      response.headers.set(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data: https://covers.openlibrary.org; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      return response;
    }
    if (url.pathname === "/api/health") return json({ ok: true });
    if (!env.OWNER_EMAIL)
      return json({ error: "Private access is not configured." }, 503);
    if (!["GET", "POST", "DELETE"].includes(request.method))
      return json({ error: "Method not allowed" }, 405);
    if (
      request.method !== "GET" &&
      request.headers.get("Origin") !== url.origin
    )
      return json({ error: "Request not allowed" }, 403);
    if (url.pathname === "/api/ocr") {
      if (!(await authenticated(request, env)))
        return json({ error: "Sign in to process photos." }, 401);
      if (request.method !== "POST")
        return json({ error: "Method not allowed" }, 405);
      return await scan(request, env);
    }
    let body: Record<string, unknown> = {};
    if (request.method === "POST") {
      if (!request.headers.get("Content-Type")?.startsWith("application/json"))
        return json({ error: "Expected JSON" }, 415);
      body = JSON.parse(
        new TextDecoder().decode(
          await limitedBody(
            request,
            url.pathname.includes("/sync/") ? 2 * 1024 * 1024 : 4096,
          ),
        ),
      );
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json({ error: "Invalid request" }, 400);
    }
    if (url.pathname.startsWith("/api/auth/"))
      return await authRoute(request, env, body);
    if (!(await authenticated(request, env)))
      return json({ error: "Sign in to sync your library." }, 401);
    if (url.pathname.startsWith("/api/isbn/") && request.method === "GET")
      return await lookupIsbn(decodeURIComponent(url.pathname.slice(10)));
    if (url.pathname === "/api/sync/push" && request.method === "POST")
      return await push(env, body);
    if (url.pathname === "/api/sync/pull" && request.method === "GET")
      return await pull(env, url.searchParams.get("since") ?? "0");
    if (
      /^\/api\/scans\/[\w-]{1,128}$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      const image = await env.SCAN_IMAGES.get(
        "scans/" + url.pathname.split("/").pop(),
      );
      if (!image) return json({ error: "Photo not found" }, 404);
      return new Response(image.body as ReadableStream, {
        headers: {
          "Content-Type": image.httpMetadata?.contentType ?? "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    return json({ error: "Not found" }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    if (
      error instanceof SyntaxError ||
      /Invalid|is required|at most/.test(message)
    )
      return json({ error: message }, 400);
    if (message === "Request too large") return json({ error: message }, 413);
    console.error("Book Highlights request failed");
    return json(
      {
        error:
          "Something went wrong. Your local changes are safe; please retry.",
      },
      503,
    );
  }
}
