import { NextResponse } from "next/server";
import sharp from "sharp";
import { getMasterSchema } from "@/lib/master-schema";
import { extractImage, type ProviderType } from "@/lib/openai-extractor";
import { normalizeRows, applyDittoRule } from "@/lib/normalize";
import type { SchemaType } from "@/types/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const maxBytes = Number(process.env.MAX_IMAGE_MB || 20) * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("image");
    const facility = String(form.get("facility") || "").trim();
    const subcenter = String(form.get("subcenter") || "").trim();
    const apiKey = String(form.get("apiKey") || "").trim();
    const provider = String(form.get("provider") || "").trim() as ProviderType;
    const model = String(form.get("model") || "").trim();
    const userRotation = Number(form.get("rotation") || 0);

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image was uploaded." }, { status: 400 });
    }
    if (!allowed.has(file.type)) {
      return NextResponse.json({ error: "Unsupported image type. Use JPEG, PNG, WEBP or GIF." }, { status: 400 });
    }
    if (file.size > maxBytes) {
      return NextResponse.json({
        error: `Image is too large. Maximum allowed size is ${process.env.MAX_IMAGE_MB || 20} MB.`,
      }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());

    // 1. Auto-orient from EXIF
    let pipeline = sharp(input, { limitInputPixels: 60_000_000 }).rotate();

    // 2. Apply explicit user rotation if provided (e.g. for sideways phone scans)
    if (userRotation && [90, 180, 270].includes(userRotation)) {
      pipeline = pipeline.rotate(userRotation);
    }

    // 3. Preprocess for enhanced OCR readability
    const processed = await pipeline
      .resize({ width: 2800, height: 2800, fit: "inside", withoutEnlargement: false })
      .normalize()
      .sharpen({ sigma: 0.8 })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();

    const schemaPreference = String(form.get("schema") || "").trim() as SchemaType;
    const forcedSchema: SchemaType | undefined =
      schemaPreference === "child" || schemaPreference === "mother" ? schemaPreference : undefined;

    const dataUrl = `data:image/jpeg;base64,${processed.toString("base64")}`;

    // 4. Extract with AI (Auto-detecting whether image is child or mother schema)
    const extracted = await extractImage({
      imageDataUrl: dataUrl,
      forcedSchema,
      context: { facility, subcenter },
      apiKey: apiKey || undefined,
      provider: provider || undefined,
      model: model || undefined,
    });

    const activeMaster = getMasterSchema(extracted.detected_schema);

    // 5. Clean values and apply ditto rule (consecutive duplicate -> '"' symbol, never 'same as above')
    const normalized = normalizeRows(extracted.rows, activeMaster);
    const rows = applyDittoRule(normalized, activeMaster);

    return NextResponse.json({
      detected_schema: extracted.detected_schema,
      schema_confidence: extracted.schema_confidence,
      schema_reason: extracted.schema_reason,
      columns: activeMaster.columns,
      detected_columns: extracted.detected_columns,
      rows,
      warnings: extracted.warnings,
    });
  } catch (error) {
    console.error("/api/analyze error", error instanceof Error ? error.message : error);
    const message = error instanceof Error ? error.message : "Unexpected extraction error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
