export type SchemaType = "mother" | "child";

export type MasterColumnType = "string" | "number" | "date";

export type MasterColumn = {
  key: string;
  header?: string;
  type: MasterColumnType;
  samples: unknown[];
};

export type MasterSchema = {
  version: number;
  schemaType?: SchemaType;
  title?: string;
  sourceWorkbook: string;
  sheets: string[];
  columns: MasterColumn[];
  vocabularies: Record<string, string[]>;
};

export type ExtractionRow = Record<string, string | null>;

export type ExtractionResult = {
  detected_schema: SchemaType;
  schema_confidence?: number;
  schema_reason?: string;
  detected_columns: Array<{
    source_label: string;
    master_key: string | null;
    confidence: number;
  }>;
  rows: ExtractionRow[];
  warnings: string[];
};
