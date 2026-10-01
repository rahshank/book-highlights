// @vitest-environment node
import { it, expect } from "vitest";
import { planRoamExport } from "../scripts/roam-plan.mjs";
it("resumes partial exports and appends explicit revisions without removing old content", () => {
  const library = {
    books: [
      {
        id: "book-1",
        title: "Title",
        highlights: [
          { id: "h-1", text: "First" },
          { id: "h-2", text: "Second" },
        ],
      },
    ],
  };
  const initial = planRoamExport(library);
  expect(initial[0].metadata).toContain("[[Highlights]]");
  const receipts = [
    { highlightId: "h-1", marker: initial[0].highlights[0].marker },
  ];
  const retry = planRoamExport(library, receipts);
  expect(retry[0].highlights.map((h: { id: string }) => h.id)).toEqual(["h-2"]);
  library.books[0].highlights[0].text = "Corrected";
  const revised = planRoamExport(library, receipts);
  expect(revised[0].highlights[0].revision).toBe(true);
});
