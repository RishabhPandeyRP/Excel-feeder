import OpenAI from "openai";
import type { MasterSchema, ExtractionResult, SchemaType } from "@/types/schema";
import { getAllSchemas, getMasterSchema } from "@/lib/master-schema";
import { buildSystemPrompt } from "@/lib/prompt";
import { validateExtraction } from "@/lib/validation";

export type ProviderType = "openai" | "gemini" | "custom";

export interface ExtractImageOptions {
  imageDataUrl: string;
  master?: MasterSchema;
  forcedSchema?: SchemaType;
  context?: { facility?: string; subcenter?: string };
  apiKey?: string;
  provider?: ProviderType;
  model?: string;
  baseUrl?: string;
}

function resolveConfig(options: ExtractImageOptions) {
  const envGemini = process.env.GEMINI_API_KEY?.trim();
  const envOpenAI = process.env.OPENAI_API_KEY?.trim();

  let provider: ProviderType = "gemini";
  let apiKey = options.apiKey?.trim();

  if (!apiKey) {
    if (envGemini) {
      provider = "gemini";
      apiKey = envGemini;
    } else if (envOpenAI) {
      provider = "openai";
      apiKey = envOpenAI;
    }
  } else {
    if (apiKey.startsWith("AIzaSy")) {
      provider = "gemini";
    } else if (apiKey.startsWith("sk-")) {
      provider = "openai";
    }
  }

  if (!apiKey) {
    throw new Error(
      "No API key found in .env.local! Please add GEMINI_API_KEY=your_key (recommended free) or OPENAI_API_KEY=your_key in your .env.local file."
    );
  }

  let model = options.model?.trim();
  let baseURL: string | undefined = options.baseUrl?.trim() || undefined;

  if (provider === "gemini") {
    baseURL = baseURL || "https://generativelanguage.googleapis.com/v1beta/openai/";
    model = model || process.env.GEMINI_MODEL || "gemini-3.6-flash";
  } else {
    baseURL = baseURL || process.env.OPENAI_BASE_URL || undefined;
    model = model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  }

  return { provider, apiKey, model, baseURL };
}

function cleanJsonResponse(raw: string): unknown {
  let cleaned = raw.trim();
  // Strip Markdown code block if present
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  }
  return JSON.parse(cleaned);
}

export async function extractImage(params: ExtractImageOptions): Promise<ExtractionResult> {
  const config = resolveConfig(params);
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });

  const allSchemas = getAllSchemas();
  const systemPrompt = buildSystemPrompt({
    schemas: {
      child: {
        title: allSchemas.child.title,
        columns: allSchemas.child.columns.map((c) => ({
          key: c.key,
          header: c.header || c.key,
          type: c.type,
        })),
        keys: allSchemas.child.columns.map((c) => c.key),
        sample_row: {
          s_no: "32",
          rch_no: "32",
          child_name: "Love",
          mother: "Pooja",
          husband: "Atveer",
          address: "Nekpur",
          dob: "2026-06-20",
          mobile: "9286459532",
        },
      },
      mother: {
        title: allSchemas.mother.title,
        columns: allSchemas.mother.columns.map((c) => ({
          key: c.key,
          header: c.header || c.key,
          type: c.type,
        })),
        keys: allSchemas.mother.columns.map((c) => c.key),
        sample_row: {
          hospital_type: null,
          aphc: null,
          subcenter: null,
          village: "Nekpur",
          anm_id: null,
          asha_id: null,
          rch_reg_no: "32",
          mother: "Pooja",
          husband: "Atveer",
          address: "Nekpur",
          age: null,
          whose_mobile: "W",
          mobile: "9286459532",
          lmp_date: null,
          registration_date: "2026-06-20",
          weight: null,
          religion: null,
          anc_date: "2026-06-20",
          which_tt: null,
          tt_date: null,
          weight2: null,
          is_hrp: null,
          hrp_type: null,
          hrp_other_name: null,
        },
      },
    },
    forced_schema: params.forcedSchema,
    selected_context: params.context,
  });

  const requestPayload = {
    model: config.model,
    messages: [
      {
        role: "system" as const,
        content: systemPrompt,
      },
      {
        role: "user" as const,
        content: [
          {
            type: "text" as const,
            text: "Analyze this RCH register image. First identify whether it matches the 'child' schema (Child Register: child_name, dob, parents, village, mobile) or 'mother' schema (Pregnant Women ANC Register: 24 pregnancy columns). Set detected_schema accordingly, transliterate Hindi to English, apply the ditto rule ('\"' for consecutive repeats, null for blank), and return valid JSON.",
          },
          {
            type: "image_url" as const,
            image_url: {
              url: params.imageDataUrl,
              detail: "high" as const,
            },
          },
        ],
      },
    ],
    response_format: { type: "json_object" as const },
    temperature: 0.1,
  };

  let response;
  try {
    response = await client.chat.completions.create(requestPayload);
  } catch (err: any) {
    if (config.provider === "gemini") {
      const fallbackModels = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];
      const nextModel = fallbackModels.find((m) => m !== config.model);
      if (nextModel) {
        console.warn(`[AI Engine] Model ${config.model} returned error, falling back to ${nextModel}...`);
        response = await client.chat.completions.create({
          ...requestPayload,
          model: nextModel,
        });
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const rawOutput = response.choices?.[0]?.message?.content;
  if (!rawOutput) {
    throw new Error("AI engine returned an empty response. Please verify the image or try again.");
  }

  let parsed: any;
  try {
    parsed = cleanJsonResponse(rawOutput);
  } catch {
    throw new Error("Failed to parse structured JSON from AI output: " + rawOutput.slice(0, 200));
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI output was not a JSON object.");
  }

  // 1. Determine detected schema
  let detectedSchema: SchemaType = params.forcedSchema || "mother";
  if (!params.forcedSchema) {
    if (parsed.detected_schema === "child" || parsed.detected_schema === "mother") {
      detectedSchema = parsed.detected_schema;
    } else {
      // Fallback: infer from row keys
      const sampleRow = parsed.rows?.[0] || {};
      if ("child_name" in sampleRow || ("s_no" in sampleRow && !("rch_reg_no" in sampleRow))) {
        detectedSchema = "child";
      } else {
        detectedSchema = "mother";
      }
    }
  }

  const activeMaster =
    params.master && params.master.schemaType === detectedSchema
      ? params.master
      : getMasterSchema(detectedSchema);

  parsed.detected_schema = detectedSchema;
  parsed.schema_confidence =
    typeof parsed.schema_confidence === "number" && !isNaN(parsed.schema_confidence)
      ? Math.min(
          1,
          Math.max(
            0,
            parsed.schema_confidence > 1 ? parsed.schema_confidence / 100 : parsed.schema_confidence
          )
        )
      : 0.98;
  parsed.schema_reason =
    parsed.schema_reason ||
    (detectedSchema === "child"
      ? "Image contains Child Register records (Child Name, Date of Birth, Mother, Husband, Mobile)"
      : "Image contains Pregnant Women ANC Register records (ANC, LMP, TT, Weight)");

  if (!Array.isArray(parsed.rows)) {
    parsed.rows = [];
  }
  if (!Array.isArray(parsed.detected_columns)) {
    parsed.detected_columns = [];
  }
  if (!Array.isArray(parsed.warnings)) {
    parsed.warnings = [];
  }

  // 2. Align each row to the active schema's columns
  parsed.rows = parsed.rows.map((row: any) => {
    const cleanRow: Record<string, string | null> = {};
    for (const col of activeMaster.columns) {
      const v = row[col.key];
      if (
        v === undefined ||
        v === null ||
        v === "" ||
        String(v).trim().toLowerCase() === "null" ||
        String(v).trim().toLowerCase() === "undefined"
      ) {
        cleanRow[col.key] = null;
      } else {
        cleanRow[col.key] = String(v).trim();
      }
    }
    return cleanRow;
  });

  return validateExtraction(parsed, activeMaster);
}
