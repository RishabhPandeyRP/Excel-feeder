import fs from "node:fs";
import path from "node:path";
import type { MasterSchema, SchemaType } from "@/types/schema";

const motherSchemaPath = path.join(process.cwd(), "config", "master-schema.json");
const childSchemaPath = path.join(process.cwd(), "config", "child-schema.json");

export function getMasterSchema(type: SchemaType = "mother"): MasterSchema {
  const filePath = type === "child" ? childSchemaPath : motherSchemaPath;
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as MasterSchema;
  raw.schemaType = type;
  if (!raw.title) {
    raw.title = type === "child" ? "Child Register Schema" : "Pregnant Women Register Schema";
  }
  return raw;
}

export function getAllSchemas(): Record<SchemaType, MasterSchema> {
  return {
    mother: getMasterSchema("mother"),
    child: getMasterSchema("child"),
  };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

/**
 * Build a compact context for the model.
 */
export function buildMasterContext(
  schema: MasterSchema,
  context?: { facility?: string; subcenter?: string },
) {
  const facilityValues = schema.vocabularies?.Facility ?? [];
  const subcenterValues = schema.vocabularies?.Sub_Facility ?? [];
  const villageValues = schema.vocabularies?.Villages ?? [];

  return {
    schema_type: schema.schemaType || "mother",
    title: schema.title,
    columns: schema.columns.map((c) => ({
      key: c.key,
      header: c.header || c.key,
      type: c.type,
    })),
    allowed_values: {
      facility: unique(facilityValues).slice(0, 20),
      subcenter: unique(subcenterValues).slice(0, 20),
      village: unique(villageValues).slice(0, 50),
      whose_mobile: ["W", "H", "N", "R", "O"],
      which_tt: ["TT1", "TT2", "TTB"],
      is_hrp: ["Y", "N"],
      hrp_type: ["H", "C", "V", "F", "S", "D", "T", "O"],
    },
    selected_context: context ?? {},
  };
}
