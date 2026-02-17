import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";

// POST /api/publish — publish highlights to Ghost or Roam
export async function POST(req: NextRequest) {
  const { book_id, target } = await req.json();

  if (!["ghost", "roam"].includes(target)) {
    return NextResponse.json({ error: "Invalid target (must be ghost or roam)" }, { status: 400 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("*, highlights(*)")
    .eq("id", book_id)
    .single();

  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (!book.highlights?.length) {
    return NextResponse.json({ error: "No highlights to publish" }, { status: 400 });
  }

  const title = `Highlights: ${book.title}${book.author ? ` by ${book.author}` : ""}`;

  if (target === "ghost") {
    return publishToGhost(title, book.author, book.highlights);
  }
  return publishToRoam(title, book.highlights);
}

async function publishToGhost(title: string, author: string, highlights: Record<string, unknown>[]) {
  const apiUrl = process.env.GHOST_API_URL;
  const apiKey = process.env.GHOST_ADMIN_API_KEY;

  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { error: "Ghost API not configured. Set GHOST_API_URL and GHOST_ADMIN_API_KEY." },
      { status: 400 },
    );
  }

  const token = ghostJwt(apiKey);
  const html = formatHighlightsHtml(title, author, highlights);

  const resp = await fetch(`${apiUrl.replace(/\/$/, "")}/ghost/api/admin/posts/`, {
    method: "POST",
    headers: {
      Authorization: `Ghost ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ posts: [{ title, html, status: "draft" }] }),
    signal: AbortSignal.timeout(30_000),
  });

  if (resp.status === 201) {
    const post = (await resp.json()).posts[0];
    return NextResponse.json({ url: post.url ?? "", id: post.id, status: "draft" });
  }

  const text = await resp.text();
  return NextResponse.json({ error: `Ghost API error ${resp.status}: ${text}` }, { status: 502 });
}

async function publishToRoam(title: string, highlights: Record<string, unknown>[]) {
  const graphName = process.env.ROAM_GRAPH_NAME;
  const apiToken = process.env.ROAM_API_TOKEN;

  if (!graphName || !apiToken) {
    return NextResponse.json(
      { error: "Roam API not configured. Set ROAM_GRAPH_NAME and ROAM_API_TOKEN." },
      { status: 400 },
    );
  }

  const children = highlights.map((h, i) => {
    let text = h.text as string;
    if (h.note) text += `\n    **Note:** ${h.note}`;
    if (h.page_number) text += ` (p. ${h.page_number})`;
    return {
      action: "create-block" as const,
      location: { "parent-page": title, order: i },
      block: { string: text },
    };
  });

  const resp = await fetch(`https://api.roamresearch.com/api/graph/${graphName}/write`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      actions: [
        { action: "create-page", page: { title } },
        { action: "batch-actions", actions: children },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (resp.status === 200) {
    return NextResponse.json({ status: "ok", page_title: title });
  }

  const text = await resp.text();
  return NextResponse.json({ error: `Roam API error ${resp.status}: ${text}` }, { status: 502 });
}

function ghostJwt(apiKey: string): string {
  const [keyId, secret] = apiKey.split(":");
  const iat = Math.floor(Date.now() / 1000);

  const header = JSON.stringify({ alg: "HS256", kid: keyId, typ: "JWT" });
  const payload = JSON.stringify({ iat, exp: iat + 300, aud: "/admin/" });

  const b64url = (data: string) =>
    Buffer.from(data).toString("base64url");

  const segments = `${b64url(header)}.${b64url(payload)}`;
  const sig = crypto
    .createHmac("sha256", Buffer.from(secret, "hex"))
    .update(segments)
    .digest("base64url");

  return `${segments}.${sig}`;
}

function formatHighlightsHtml(
  title: string,
  author: string,
  highlights: Record<string, unknown>[],
): string {
  const now = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const parts = [
    `<h2>${title}</h2>`,
    `<p><strong>By ${author}</strong> &mdash; collected ${now}</p>`,
    "<hr>",
  ];

  for (const h of highlights) {
    parts.push("<blockquote>", `<p>${h.text}</p>`, "</blockquote>");
    const meta: string[] = [];
    if (h.page_number) meta.push(`Page ${h.page_number}`);
    if (h.location) meta.push(`Location ${h.location}`);
    if (h.chapter) meta.push(h.chapter as string);
    if (meta.length) parts.push(`<p><small>${meta.join(" &bull; ")}</small></p>`);
    if (h.note) parts.push(`<p><strong>Note:</strong> ${h.note}</p>`);
    parts.push("<br>");
  }

  return parts.join("\n");
}
