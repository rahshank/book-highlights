import process from "node:process";
import console from "node:console";
// Run from the repository root. Private manifests and receipts are never committed.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { planRoamExport } from "./roam-plan.mjs";
const folder = ".private/roam";
mkdirSync(folder, { recursive: true, mode: 0o700 });
const args = process.argv.slice(2);
function query(sql) {
  const out = execFileSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "book-highlights",
      "--remote",
      "--json",
      "--command",
      sql,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
        WRANGLER_LOG_PATH: "/tmp/highlights-roam-wrangler.log",
      },
      maxBuffer: 20_000_000,
    },
  );
  const result = JSON.parse(out);
  if (result.some((r) => !r.success)) throw new Error("Cloud read failed");
  return result[0].results;
}
if (args[0] === "prepare") {
  const rows = query(
    "SELECT entity,payload FROM records WHERE json_extract(payload,'$.deletedAt') IS NULL",
  );
  const books = rows
    .filter((r) => r.entity === "book")
    .map((r) => JSON.parse(r.payload));
  const highlights = rows
    .filter((r) => r.entity === "highlight")
    .map((r) => JSON.parse(r.payload));
  const library = {
    books: books.map((b) => ({
      ...b,
      highlights: highlights.filter((h) => h.bookId === b.id),
    })),
  };
  let receipts = [];
  try {
    receipts = JSON.parse(readFileSync(`${folder}/receipts.json`, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  writeFileSync(`${folder}/library.json`, JSON.stringify(library, null, 2), {
    mode: 0o600,
  });
  const plan = planRoamExport(library, receipts);
  writeFileSync(`${folder}/pending.json`, JSON.stringify(plan, null, 2), {
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      sources: plan.length,
      highlights: plan.reduce((n, b) => n + b.highlights.length, 0),
      manifest: `${folder}/pending.json`,
    }),
  );
} else if (args[0] === "record") {
  const incoming = JSON.parse(readFileSync(args[1], "utf8"));
  let receipts = [];
  try {
    receipts = JSON.parse(readFileSync(`${folder}/receipts.json`, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  for (const r of incoming) {
    if (!r.marker || !r.pageUid || !r.highlightId || !r.verifiedAt)
      throw new Error("Only verified receipts may be recorded");
    if (!receipts.some((x) => x.marker === r.marker)) receipts.push(r);
  }
  writeFileSync(`${folder}/receipts.json`, JSON.stringify(receipts, null, 2), {
    mode: 0o600,
  });
  console.log(`Recorded ${receipts.length} verified exports.`);
} else {
  throw new Error("Use prepare or record <verified-receipts.json>");
}
