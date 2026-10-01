import { json, type WorkerEnv } from "./types";
import {
  validateOperation,
  bookFields,
  highlightFields,
  type Operation,
} from "../../src/shared/validation";
export { validateOperation, type Operation } from "../../src/shared/validation";
type Payload = Record<string, unknown>;
export function mergeRecord(
  op: Operation,
  current: Payload | null,
  previousClocks: Record<string, string>,
) {
  const fields = op.entity === "book" ? bookFields : highlightFields;
  const stamp =
    new Date(
      Math.min(Date.parse(String(op.payload.updatedAt)), Date.now() + 60000),
    ).toISOString() +
    "|" +
    op.id;
  const payload: Payload = current
    ? { ...current }
    : { id: op.entityId, version: 0, writeOrder: 0, deletedAt: null };
  const clocks = { ...previousClocks };
  for (const field of op.changedFields ?? fields) {
    if (current && ["createdAt", "bookId"].includes(field)) continue;
    if (current?.deletedAt) continue; // Late edits cannot resurrect a deleted record.
    if (stamp >= (clocks[field] ?? "")) {
      payload[field] =
        op.payload[field] ??
        (field === "deletedAt" || field === "pageNumber" ? null : "");
      clocks[field] = stamp;
    }
  }
  if (op.action === "delete")
    payload.deletedAt = op.payload.deletedAt || op.payload.updatedAt;
  payload.updatedAt =
    current && String(current.updatedAt) > stamp.slice(0, 24)
      ? current.updatedAt
      : stamp.slice(0, 24);
  payload.version = Number(current?.version ?? 0) + 1;
  return { payload, clocks };
}
export async function push(env: WorkerEnv, input: Record<string, unknown>) {
  if (!Array.isArray(input.operations) || input.operations.length > 50)
    return json({ error: "Send at most 50 changes at once." }, 400);
  const ops = input.operations.map(validateOperation);
  for (const op of ops) {
    let committed = false;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (
        await env.DB.prepare(
          "select operation_id from sync_receipts where operation_id=?",
        )
          .bind(op.id)
          .first()
      ) {
        committed = true;
        break;
      }
      const row = await env.DB.prepare(
        "select payload,clocks,revision from records where entity=? and id=?",
      )
        .bind(op.entity, op.entityId)
        .first<{ payload: string; clocks: string; revision: number }>();
      const { payload, clocks } = mergeRecord(
        op,
        row ? JSON.parse(row.payload) : null,
        row ? JSON.parse(row.clocks) : {},
      );
      // Record, receipt and change event commit in one SQL transaction via triggers.
      const result = row
        ? await env.DB.prepare(
            "update records set payload=?,clocks=?,revision=revision+1,operation_id=? where entity=? and id=? and revision=? and not exists(select 1 from sync_receipts where operation_id=?) returning id",
          )
            .bind(
              JSON.stringify(payload),
              JSON.stringify(clocks),
              op.id,
              op.entity,
              op.entityId,
              row.revision,
              op.id,
            )
            .first()
        : await env.DB.prepare(
            "insert into records(entity,id,payload,clocks,revision,operation_id) select ?,?,?,?,1,? where not exists(select 1 from sync_receipts where operation_id=?) on conflict(entity,id) do nothing returning id",
          )
            .bind(
              op.entity,
              op.entityId,
              JSON.stringify(payload),
              JSON.stringify(clocks),
              op.id,
              op.id,
            )
            .first();
      if (result) {
        committed = true;
        break;
      }
    }
    if (!committed)
      return json(
        { error: "Another device is updating this item. Please retry." },
        409,
      );
  }
  return json({ accepted: ops.length, cursor: String(input.cursor ?? "") });
}
export async function pull(env: WorkerEnv, since: string) {
  if (since && !/^\d+$/.test(since)) since = "0"; // A July timestamp cursor restarts the new ordered log safely.
  const result = await env.DB.prepare(
    "select seq,entity,entity_id,payload from changes where seq>? order by seq limit 201",
  )
    .bind(Number(since || 0))
    .all<{ seq: number; entity: string; entity_id: string; payload: string }>();
  const rows = result.results.slice(0, 200);
  return json({
    cursor: String(rows.at(-1)?.seq ?? since ?? "0"),
    hasMore: result.results.length > 200,
    events: rows.map((r) => ({
      entity: r.entity,
      entityId: r.entity_id,
      payload: JSON.parse(r.payload),
    })),
  });
}
