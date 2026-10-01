import { useEffect, useState } from "react";
import { canonicalSourceUrl } from "./shared/capture";
export interface ArticleMetadata {
  title: string;
  author: string;
  publisher: string;
  publishedAt: string;
}
export function useArticleMetadata(input: string) {
  const [result, setResult] = useState<{
    url: string;
    status: string;
    data?: ArticleMetadata;
  }>({ url: "", status: "" });
  let url = "";
  try {
    if (/^https?:\/\//i.test(input.trim())) url = canonicalSourceUrl(input);
  } catch {
    /* Incomplete typing. */
  }
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let current = true;
    const timer = setTimeout(async () => {
      if (!navigator.onLine) {
        setResult({
          url,
          status:
            "Offline — you can add the details yourself or save with the link.",
        });
        return;
      }
      setResult({ url, status: "Looking up article details…" });
      try {
        const response = await fetch("/api/article-metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(12000),
          ]),
        });
        if (!response.ok) throw new Error("Lookup unavailable");
        const data: ArticleMetadata = await response.json();
        if (current)
          setResult({
            url,
            data,
            status: data.title
              ? "Article details found. You can edit them below."
              : "No article title found. You can add one or save with the link.",
          });
      } catch {
        if (current)
          setResult({
            url,
            status:
              "Couldn’t retrieve article details. You can add them or save with the link.",
          });
      }
    }, 450);
    return () => {
      current = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [url]);
  return result.url === url ? result : { url, status: "", data: undefined };
}
