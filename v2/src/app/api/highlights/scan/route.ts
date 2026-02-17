import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";

const SYSTEM_PROMPT = `You are an OCR transcription engine for a personal reading tracker app. \
The user photographs pages from published books they own so they can save \
highlights and quotations for personal study. Your job is to extract ONLY \
the passages that the reader has highlighted, underlined, or otherwise marked. \
This is a purely mechanical transcription task.`;

const VISION_PROMPT = `Look at this photograph of a printed book page. The reader has marked \
certain passages by underlining, highlighting, or bracketing them.

IMPORTANT: There may be MULTIPLE marked passages on the page — some short \
(even a single phrase or sentence) and some long (a full paragraph). \
Carefully scan the ENTIRE page for ANY underline, highlight, or bracket \
mark, no matter how short. A single underlined sentence counts as a \
passage and must be extracted. Do not skip short markings.

Extract ONLY the marked/highlighted/underlined passages — ignore all \
unmarked text on the page. \
If the photo shows two pages of an open book, check both for markings \
but ignore any page with no marked text. \
Return each highlighted passage on its own line, preserving the original \
wording exactly. List them in the order they appear on the page. \
If an underline or highlight covers only part of a sentence, include the \
FULL sentence so the passage reads naturally.

If a marked passage is partially unreadable, transcribe what you can read \
and use [...] for illegible portions.

PAGE NUMBER: If you can see a printed page number on the page, include it \
on the very first line in this exact format: PAGE: <number>
If two page numbers are visible (open book), use the page with the marked \
passages. If no page number is visible, omit the PAGE line entirely.

Do not add any other commentary, headers, or explanations. \
If there are no highlighted or underlined passages visible, respond with \
exactly: NO_HIGHLIGHTS_FOUND`;

function parsePageNumber(text: string): { text: string; page: number | null } {
  const match = text.match(/^PAGE:\s*(\d+)\s*\n?/);
  if (match) {
    return {
      text: text.slice(match[0].length).trim(),
      page: parseInt(match[1], 10),
    };
  }
  return { text, page: null };
}

// POST /api/highlights/scan — upload photo, extract text via Claude Haiku Vision
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const photo = formData.get("photo") as File | null;

  if (!photo) {
    return NextResponse.json({ error: "No photo uploaded" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  // Read file and convert to base64
  const bytes = await photo.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = photo.type || "image/jpeg";

  // Upload to Supabase Storage for reference
  const ext = photo.name.split(".").pop() ?? "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;

  await supabase.storage.from("scan-photos").upload(filename, Buffer.from(bytes), {
    contentType: mimeType,
  });

  // Call Claude Haiku Vision
  const client = new Anthropic({ apiKey });

  let extractedText: string | null = null;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mimeType as "image/jpeg", data: base64 },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    });

    const block = response.content[0];
    if (block.type === "text") {
      extractedText = block.text;
    }
  } catch (err) {
    console.error("[OCR] Claude Haiku failed:", err);
  }

  if (!extractedText || extractedText === "NO_HIGHLIGHTS_FOUND") {
    return NextResponse.json(
      { error: "Could not extract text from image" },
      { status: 422 },
    );
  }

  const { text, page } = parsePageNumber(extractedText);

  return NextResponse.json({
    text,
    source_image: filename,
    detected_page: page,
  });
}
