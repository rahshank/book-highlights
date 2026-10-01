type Payload = Record<string, unknown>;
export interface Operation {
  id: string;
  entity: "book" | "highlight";
  entityId: string;
  action: "upsert" | "delete";
  payload: Payload;
  changedFields?: string[];
}
export const bookFields = [
  "title",
  "author",
  "isbn",
  "coverUrl",
  "publisher",
  "year",
  "source",
  "notes",
  "createdAt",
  "deletedAt",
];
export const highlightFields = [
  "bookId",
  "text",
  "note",
  "pageNumber",
  "location",
  "chapter",
  "source",
  "sourceImage",
  "createdAt",
  "deletedAt",
];
export function validateOperation(value: unknown): Operation {
  if (!value || typeof value !== "object")
    throw new Error("Invalid sync operation");
  const op = value as Operation;
  if (
    !["book", "highlight"].includes(op.entity) ||
    !["upsert", "delete"].includes(op.action) ||
    typeof op.id !== "string" ||
    !/^[\w-]{1,128}$/.test(op.id) ||
    typeof op.entityId !== "string" ||
    !/^[\w-]{1,128}$/.test(op.entityId) ||
    !op.payload ||
    op.payload.id !== op.entityId
  )
    throw new Error("Invalid sync operation");
  const p = op.payload,
    fields = op.entity === "book" ? bookFields : highlightFields;
  if (
    typeof p.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(p.updatedAt))
  )
    throw new Error("Invalid edit timestamp");
  if (op.entity === "book" && (typeof p.title !== "string" || !p.title.trim()))
    throw new Error("Book title is required");
  if (
    op.entity === "highlight" &&
    (typeof p.text !== "string" ||
      !p.text.trim() ||
      typeof p.bookId !== "string" ||
      !/^[\w-]{1,128}$/.test(p.bookId))
  )
    throw new Error("Invalid highlight");
  for (const k of fields) {
    const v = p[k];
    if (k === "pageNumber") {
      if (v != null && (!Number.isInteger(v) || Number(v) < 1))
        throw new Error("Invalid page number");
    } else if (v != null && (typeof v !== "string" || v.length > 100000))
      throw new Error("Invalid field");
  }
  if (
    op.changedFields &&
    (!Array.isArray(op.changedFields) ||
      op.changedFields.some((k) => !fields.includes(k)))
  )
    throw new Error("Invalid changed field");
  if (new TextEncoder().encode(JSON.stringify(op)).length > 1_000_000)
    throw new Error(
      "Invalid item: reduce its text before saving (maximum 1 MB).",
    );
  return op;
}
