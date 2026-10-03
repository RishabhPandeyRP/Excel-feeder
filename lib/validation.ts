import { z } from "zod";
import type { MasterSchema, ExtractionResult } from "@/types/schema";

export function makeExtractionSchema(master: MasterSchema) {
  const rowShape: Record<string, z.ZodTypeAny> = {};
  for (const column of master.columns) {
    rowShape[column.key] = z.string().nullable();
  }

  return z.object({
    detected_schema: z.enum(["mother", "child"]).default(master.schemaType || "mother"),
    schema_confidence: z.number().optional().default(0.95),
    schema_reason: z.string().optional().default(""),
    detected_columns: z
      .array(
        z.object({
          source_label: z.string().optional().default(""),
          master_key: z.string().nullable().optional(),
          confidence: z.number().optional().default(1),
        })
      )
      .optional()
      .default([]),
    rows: z.array(z.object(rowShape)),
    warnings: z.array(z.string()).optional().default([]),
  });
}

export function validateExtraction(raw: unknown, master: MasterSchema): ExtractionResult {
  return makeExtractionSchema(master).parse(raw) as unknown as ExtractionResult;
}
