// @vitest-environment node
import { expect, it } from "vitest";
import { articleMetadata, parseMetadata } from "./metadata";
it("reads title, multiple authors and published date from article JSON-LD", () => {
  expect(
    parseMetadata(
      `<html><head><script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","headline":"Article & ideas","author":[{"name":"One"},{"name":"Two"}],"datePublished":"2026-09-18T12:00:00Z","publisher":{"name":"Journal"}}]}</script></head></html>`,
      "https://example.com/a",
    ),
  ).toEqual({
    title: "Article & ideas",
    author: "One & Two",
    publisher: "Journal",
    publishedAt: "2026-09-18",
  });
});
it("reads Arena's visible byline without collecting unrelated author links", () => {
  expect(
    parseMetadata(
      `<html><head><meta property="og:title" content="Forward Deployed"></head><body><div data-framer-name="MetaItem"><a href="../authors/nikhil-davar">Nikhil Davar</a><a href="../authors/byrne-hobart">Byrne Hobart</a><time datetime="2026-09-18T00:00:00Z"></time></div><footer><a href="/authors/other">Unrelated</a></footer></body></html>`,
      "https://arenamag.com/articles/forward-deployed",
    ),
  ).toMatchObject({
    title: "Forward Deployed",
    author: "Nikhil Davar & Byrne Hobart",
    publishedAt: "2026-09-18",
  });
});
it("rejects internal URLs before any request and revalidates redirects and DNS answers", async () => {
  let calls = 0;
  const fail = async () => {
    calls++;
    throw new Error("Must not fetch");
  };
  for (const url of [
    "http://127.0.0.1/",
    "http://2130706433/",
    "http://[::ffff:127.0.0.1]/",
    "https://localhost/",
    "https://example.com:444/",
    "https://user:pass@example.com/",
  ]) {
    await expect(articleMetadata(url, fail)).rejects.toThrow();
  }
  expect(calls).toBe(0);
  const targets: string[] = [];
  const redirect = async (input: RequestInfo | URL) => {
    const url = String(input);
    targets.push(url);
    if (url.startsWith("https://cloudflare-dns.com/"))
      return Response.json({
        Status: 0,
        Answer: [{ type: 1, data: "93.184.216.34" }],
      });
    return new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest" },
    });
  };
  await expect(
    articleMetadata("https://example.com/a", redirect),
  ).rejects.toThrow();
  expect(targets.some((x) => x.includes("169.254"))).toBe(false);
  await expect(
    articleMetadata("https://example.com/a", async () =>
      Response.json({ Status: 0, Answer: [{ type: 1, data: "10.0.0.1" }] }),
    ),
  ).rejects.toThrow();
});
it("bounds publisher content and refuses non-HTML responses", async () => {
  const call =
    (mime: string, body: string) => async (input: RequestInfo | URL) =>
      String(input).startsWith("https://cloudflare-dns.com/")
        ? Response.json({
            Status: 0,
            Answer: [{ type: 1, data: "93.184.216.34" }],
          })
        : new Response(body, { headers: { "content-type": mime } });
  await expect(
    articleMetadata("https://example.com/a", call("application/pdf", "pdf")),
  ).rejects.toThrow();
  await expect(
    articleMetadata(
      "https://example.com/a",
      call("text/html", "x".repeat(2_500_001)),
    ),
  ).rejects.toThrow();
  expect(
    await articleMetadata(
      "https://example.com/a",
      call("text/html", "<title>Actual title</title>"),
    ),
  ).toMatchObject({ title: "Actual title" });
});
