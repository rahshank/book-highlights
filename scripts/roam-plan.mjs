import { createHash } from "node:crypto";
const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 20);
// One logical line avoids turning quoted source prose into new Markdown blocks.
const line = (value) =>
  String(value || "")
    .replace(/\r?\n/g, " ")
    .trim();
export function planRoamExport(library, receipts = []) {
  const done = new Set(receipts.map((r) => r.marker));
  return library.books
    .filter((b) => !b.deletedAt)
    .map((b) => ({
      sourceId: b.id,
      title: b.title,
      sourceMarker: `highlights-source:: ${b.id}`,
      metadata: `- [[Highlights]]\n- highlights-source:: ${b.id}\n${b.author ? `- Author: ${line(b.author)}\n` : ""}${b.url ? `- Source: ${b.url}\n` : ""}- [Open in Highlights](https://highlights.rahulshankar.com/#book/${b.id})`,
      highlights: b.highlights
        .filter((h) => !h.deletedAt)
        .map((h) => {
          const content = {
            text: h.text,
            note: h.note || "",
            page: h.pageNumber || h.page_number || null,
            location: h.location || "",
            chapter: h.chapter || "",
            sourceLink: h.sourceLink || "",
          };
          const version = hash(content),
            marker = `highlights-entry:: ${h.id}/${version}`;
          return {
            id: h.id,
            version,
            marker,
            revision: receipts.some((r) => r.highlightId === h.id),
            markdown: `- ${line(content.text)}\n  - ${marker}${content.note ? `\n  - Note: ${line(content.note)}` : ""}${content.page ? `\n  - Page: ${content.page}` : ""}${content.location ? `\n  - Location: ${line(content.location)}` : ""}${content.chapter ? `\n  - Chapter: ${line(content.chapter)}` : ""}${content.sourceLink ? `\n  - [Open passage](${content.sourceLink})` : ""}`,
          };
        })
        .filter((h) => !done.has(h.marker)),
    }))
    .filter((b) => b.highlights.length);
}
