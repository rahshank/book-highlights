import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.API_URL || "http://backend:8000";

export async function POST(req: NextRequest) {
  // Forward the request as-is to the backend, preserving the original
  // content-type header (which includes the multipart boundary).
  const resp = await fetch(`${BACKEND}/api/highlights/scan`, {
    method: "POST",
    headers: { "content-type": req.headers.get("content-type") ?? "" },
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
