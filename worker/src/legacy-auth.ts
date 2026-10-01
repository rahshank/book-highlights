import { digest, json, rateLimit, type WorkerEnv } from "./types";
const COOKIE = "__Host-book-session";
function cookieName(request: Request) {
  return new URL(request.url).protocol === "https:" ? COOKIE : "book-session";
}
function cookie(value: string, request: Request, age: number) {
  return `${cookieName(request)}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
function token(request: Request) {
  return (
    request.headers
      .get("Cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName(request) + "="))
      ?.split("=")[1] ?? ""
  );
}
export async function authenticated(request: Request, env: WorkerEnv) {
  const t = token(request);
  if (!t) return false;
  return Boolean(
    await env.DB.prepare(
      "select expires from auth_sessions where token_hash=? and expires>?",
    )
      .bind(await digest(t), Date.now())
      .first(),
  );
}
export async function authRoute(
  request: Request,
  env: WorkerEnv,
  body: Record<string, unknown>,
  send: typeof fetch = fetch,
) {
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/session" && request.method === "GET")
    return json({ signedIn: await authenticated(request, env) });
  if (request.method !== "POST") return json({ error: "Not found" }, 404);
  if (path === "/api/auth/logout") {
    await env.DB.prepare("delete from auth_sessions where token_hash=?")
      .bind(await digest(token(request)))
      .run();
    return json({ ok: true }, 200, { "Set-Cookie": cookie("", request, 0) });
  }
  if (path === "/api/auth/request") {
    if (!env.OWNER_EMAIL || !env.RESEND_API_KEY)
      return json({ error: "Sign-in email is not configured." }, 503);
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const ip = request.headers.get("CF-Connecting-IP") ?? "local";
    if (!(await rateLimit(env, "email-ip:" + ip, 10, 600)))
      return json(
        { error: "Please wait a few minutes before requesting another code." },
        429,
      );
    const id = crypto.randomUUID();
    if (email === env.OWNER_EMAIL.toLowerCase()) {
      if (!(await rateLimit(env, "email-owner", 5, 600)))
        return json(
          {
            error: "Please wait a few minutes before requesting another code.",
          },
          429,
        );
      const code = String(
        crypto.getRandomValues(new Uint32Array(1))[0] % 100000000,
      ).padStart(8, "0");
      await env.DB.prepare(
        "insert into auth_challenges(id,email,code_hash,expires) values(?,?,?,?)",
      )
        .bind(id, email, await digest(id + ":" + code), Date.now() + 600000)
        .run();
      const result = await send("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Book Highlights <onboarding@resend.dev>",
          to: [email],
          subject: "Your Book Highlights sign-in code",
          text: `Your Book Highlights sign-in code is ${code}.\n\nIt expires in 10 minutes. If you did not request it, you can ignore this email.`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!result.ok)
        return json(
          { error: "The email could not be sent. Please try again." },
          502,
        );
    }
    return json({ challengeId: id });
  }
  if (path === "/api/auth/verify") {
    if (
      typeof body.challengeId !== "string" ||
      typeof body.code !== "string" ||
      !/^\d{8}$/.test(body.code)
    )
      return json(
        { error: "Enter the eight-digit code from your email." },
        400,
      );
    const id = body.challengeId;
    // Increment the attempt atomically before checking; consume the challenge atomically.
    const challenge = await env.DB.prepare(
      "update auth_challenges set attempts=attempts+1 where id=? and attempts<5 and expires>? returning code_hash,email",
    )
      .bind(id, Date.now())
      .first<{ code_hash: string; email: string }>();
    if (
      !challenge ||
      challenge.email !== env.OWNER_EMAIL.toLowerCase() ||
      (await digest(id + ":" + body.code)) !== challenge.code_hash
    )
      return json(
        {
          error:
            "That code is incorrect or expired. Request a new one if needed.",
        },
        401,
      );
    const consumed = await env.DB.prepare(
      "delete from auth_challenges where id=? returning id",
    )
      .bind(id)
      .first();
    if (!consumed)
      return json({ error: "This code has already been used." }, 401);
    const session = crypto.randomUUID() + crypto.randomUUID();
    const age = 60 * 60 * 24 * 30;
    await env.DB.prepare(
      "insert into auth_sessions(token_hash,expires) values(?,?)",
    )
      .bind(await digest(session), Date.now() + age * 1000)
      .run();
    await env.DB.batch([
      env.DB.prepare("delete from auth_challenges where expires<?").bind(
        Date.now(),
      ),
      env.DB.prepare("delete from auth_sessions where expires<?").bind(
        Date.now(),
      ),
      env.DB.prepare("delete from request_limits where expires<?").bind(
        Date.now() / 1000,
      ),
    ]);
    return json({ ok: true }, 200, {
      "Set-Cookie": cookie(session, request, age),
    });
  }
  return json({ error: "Not found" }, 404);
}
