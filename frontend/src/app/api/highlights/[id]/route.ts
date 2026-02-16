import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.API_URL || "http://backend:8000";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resp = await fetch(`${BACKEND}/api/highlights/${id}`, {
    method: "PATCH",
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
    body: req.body,
    // @ts-expect-error -- Node fetch supports duplex for streaming bodies
    duplex: "half",
  });

  const data = await resp.text();
  return new NextResponse(data, {
    status: resp.status,
    headers: { "content-type": resp.headers.get("content-type") ?? "application/json" },
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const resp = await fetch(`${BACKEND}/api/highlights/${id}`, {
    method: "DELETE",
  });

  const data = await resp.text();
  return new NextResponse(data, {
    status: resp.status,
    headers: { "content-type": resp.headers.get("content-type") ?? "application/json" },
  });
}
