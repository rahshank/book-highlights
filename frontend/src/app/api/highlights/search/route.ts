import { NextRequest, NextResponse } from "next/server";

const BACKEND = process.env.API_URL || "http://backend:8000";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const resp = await fetch(`${BACKEND}/api/highlights/search?q=${encodeURIComponent(q)}`);

  const data = await resp.text();
  return new NextResponse(data, {
    status: resp.status,
    headers: { "content-type": resp.headers.get("content-type") ?? "application/json" },
  });
}
