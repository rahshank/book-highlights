/** Only public web links are rendered. No fetching is performed here. */
export function safeSourceLink(value: string): string {
  if (!value.trim()) return "";
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a complete http or https link.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    value.length > 16000
  )
    throw new Error("Enter a web link without a username or password.");
  return url.href;
}
export function canonicalSourceUrl(value: string): string {
  const safe = safeSourceLink(value);
  if (!safe) return "";
  const url = new URL(safe);
  url.hash = "";
  for (const key of [...url.searchParams.keys()])
    if (/^utm_/i.test(key) || ["fbclid", "gclid"].includes(key.toLowerCase()))
      url.searchParams.delete(key);
  return url.href;
}
export function textFromFragment(value: string): string {
  try {
    const directive = new URL(value).hash.split(":~:")[1];
    const values = directive?.split("&").filter((v) => v.startsWith("text="));
    if (!values || values.length !== 1) return "";
    const pieces = values[0].slice(5).split(",");
    if (pieces[0]?.endsWith("-")) pieces.shift();
    if (pieces.at(-1)?.startsWith("-")) pieces.pop();
    return pieces.length === 1 ? decodeURIComponent(pieces[0]) : "";
  } catch {
    return "";
  }
}
export interface CaptureDraft {
  page: string;
  captureId: string;
  sourceId?: string;
  title: string;
  author: string;
  url: string;
  publisher: string;
  publishedAt: string;
  text: string;
  note: string;
  sourceLink: string;
}
export const DRAFT_KEY = "highlights-capture-draft";
export function blankDraft(): CaptureDraft {
  return {
    page: "",
    captureId: crypto.randomUUID(),
    title: "",
    author: "",
    url: "",
    publisher: "",
    publishedAt: "",
    text: "",
    note: "",
    sourceLink: "",
  };
}
export function readCaptureDraft(): CaptureDraft {
  try {
    const raw = location.hash.startsWith("#capture=")
      ? decodeURIComponent(location.hash.slice(9))
      : sessionStorage.getItem(DRAFT_KEY);
    if (!raw || raw.length > 150000) return blankDraft();
    const input = JSON.parse(raw);
    const draft = blankDraft();
    for (const key of Object.keys(draft) as (keyof CaptureDraft)[]) {
      if (typeof input[key] === "string")
        draft[key] = input[key].slice(0, 50000);
    }
    if (typeof input.sourceId === "string") draft.sourceId = input.sourceId;
    if (!/^[\w-]{1,128}$/.test(draft.captureId))
      draft.captureId = crypto.randomUUID();
    // In-progress URLs may be incomplete. Validate at save, without losing the passage on reload.
    return draft;
  } catch {
    return blankDraft();
  }
}
