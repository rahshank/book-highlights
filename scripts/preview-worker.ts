// Local-only preview entry. Never used by wrangler.toml or included in the web build.
import { handleRequest } from "../worker/src/index";
import { authRoute } from "../worker/src/auth";
import type { WorkerEnv } from "../worker/src/types";
export default {
  async fetch(request: Request, env: WorkerEnv) {
    if (new URL(request.url).hostname !== "127.0.0.1")
      return new Response("Local preview only", { status: 403 });
    if (
      new URL(request.url).pathname.startsWith("/api/auth/")
    ) {
      if(request.method === "POST" && request.headers.get("Origin") !== new URL(request.url).origin) return new Response("Forbidden", {status:403});
      const body = request.method === "POST" ? (await request.clone().json()) as Record<string, unknown> : {};
      return authRoute(request, env, body, async (_url, init) => {
        const text = JSON.parse(String(init?.body)).text;
        console.log("LOCAL PREVIEW ONLY:", text);
        return new Response("{}");
      });
    }
    return handleRequest(request, env);
  },
};
