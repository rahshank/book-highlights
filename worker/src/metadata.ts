import { parseHTML } from "linkedom";
import ipaddr from "ipaddr.js";
import { canonicalSourceUrl } from "../../src/shared/capture";

function publicHost(host: string) {
  const h = host
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (ipaddr.isValid(h)) {
    const a = ipaddr.process(h);
    if (a.range() !== "unicast")
      throw new Error("Only public article links are supported.");
  } else if (
    !h.includes(".") ||
    /\.(localhost|local|internal|test|invalid|onion)$/.test(h)
  ) {
    throw new Error("Only public article links are supported.");
  }
}
function publicUrl(input: string) {
  if (typeof input !== "string" || input.length > 4096)
    throw new Error("Invalid article link.");
  const url = new URL(canonicalSourceUrl(input));
  if (url.port) throw new Error("Special ports are not supported.");
  publicHost(url.hostname);
  return url.href;
}
async function bounded(response: Response, max: number) {
  if (!response.body) throw new Error("Empty publisher response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error("Publisher response is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(bytes);
}
// DNS checks supplement Workers' strictly-public global fetch; never forward cookies or use an origin binding.
export async function articleMetadata(
  input: string,
  call: typeof fetch = fetch,
) {
  let url = publicUrl(input);
  const signal = AbortSignal.timeout(10000);
  for (let hop = 0; hop < 4; hop++) {
    const addresses = await Promise.all(
      ["A", "AAAA"].map(async (type) => {
        const r = await call(
          "https://cloudflare-dns.com/dns-query?name=" +
            encodeURIComponent(new URL(url).hostname) +
            "&type=" +
            type,
          {
            headers: { Accept: "application/dns-json" },
            redirect: "manual",
            signal,
          },
        );
        if (!r.ok) throw new Error("Could not verify publisher address.");
        const data = JSON.parse(await bounded(r, 64000));
        if (data.Status !== 0) throw new Error("Could not resolve publisher.");
        return (data.Answer || [])
          .filter((a: { type: number }) => a.type === 1 || a.type === 28)
          .map((a: { data: string }) => a.data) as string[];
      }),
    );
    if (!addresses.flat().length)
      throw new Error("Could not resolve publisher.");
    for (const address of addresses.flat()) {
      if (!ipaddr.isValid(address))
        throw new Error("Invalid publisher address.");
      publicHost(address);
    }
    const response = await call(url, {
      redirect: "manual",
      signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Highlights/1.0",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (!location) throw new Error("Invalid publisher redirect.");
      url = publicUrl(new URL(location, url).href);
      continue;
    }
    if (
      !response.ok ||
      !/^(text\/html|application\/xhtml\+xml)(;|$)/i.test(
        response.headers.get("content-type") || "",
      )
    ) {
      await response.body?.cancel();
      throw new Error("Publisher details unavailable.");
    }
    return parseMetadata(await bounded(response, 2_500_000), url);
  }
  throw new Error("Too many publisher redirects.");
}

export function parseMetadata(html: string, url: string) {
  const { document } = parseHTML(html);
  const clean = (v: unknown) =>
    typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  const meta = (...keys: string[]) => {
    for (const key of keys) {
      const v = clean(
        document
          .querySelector(`meta[property="${key}"],meta[name="${key}"]`)
          ?.getAttribute("content"),
      );
      if (v) return v;
    }
    return "";
  };
  type Node = Record<string, unknown>;
  const articles: Node[] = [];
  function visit(v: unknown, depth = 0) {
    if (!v || typeof v !== "object" || depth > 12) return;
    if (Array.isArray(v)) {
      for (const item of v) visit(item, depth + 1);
      return;
    }
    const n = v as Node;
    if (
      [n["@type"]]
        .flat()
        .some(
          (t) => typeof t === "string" && /(?:Article|BlogPosting)$/.test(t),
        )
    ) {
      const identity =
        n.url ||
        (typeof n.mainEntityOfPage === "string"
          ? n.mainEntityOfPage
          : (n.mainEntityOfPage as Node)?.["@id"]);
      try {
        if (
          !identity ||
          new URL(String(identity), url).pathname.replace(/\/$/, "") ===
            new URL(url).pathname.replace(/\/$/, "")
        )
          articles.push(n);
      } catch {
        /* Malformed optional metadata. */
      }
    }
    visit(n["@graph"], depth + 1);
    visit(n.mainEntity, depth + 1);
  }
  for (const script of document.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      visit(JSON.parse(script.textContent || ""));
    } catch {
      /* Optional metadata. */
    }
  }
  const article = articles[0];
  const names = (value: unknown): string =>
    Array.isArray(value)
      ? value.map(names).filter(Boolean).join(" & ")
      : clean(
          typeof value === "object" && value ? (value as Node).name : value,
        );
  let author = names(article?.author) || meta("author", "parsely-author");
  let publisher = names(article?.publisher) || meta("og:site_name");
  let published =
    clean(article?.datePublished) ||
    meta("article:published_time", "pubdate", "datePublished");
  if (new URL(url).hostname.replace(/^www\./, "") === "arenamag.com") {
    const bylines = [
      ...document.querySelectorAll(
        '[data-framer-name="MetaItem"] a[href*="/authors/"]',
      ),
    ]
      .map((a) => clean(a.textContent))
      .filter(Boolean);
    author ||= [...new Set(bylines)].join(" & ");
    publisher ||= "Arena Magazine";
    published ||= clean(
      document.querySelector("time[datetime]")?.getAttribute("datetime"),
    );
  }
  author ||= clean(
    document.querySelector(
      '[rel="author"], [itemprop="author"] [itemprop="name"]',
    )?.textContent,
  );
  const day = published.slice(0, 10);
  return {
    title:
      clean(article?.headline) ||
      meta("og:title", "twitter:title") ||
      clean(document.querySelector("title")?.textContent),
    author: clean(author),
    publisher: clean(publisher) || new URL(url).hostname,
    publishedAt:
      /^\d{4}-\d{2}-\d{2}$/.test(day) && !Number.isNaN(Date.parse(day))
        ? day
        : "",
  };
}
