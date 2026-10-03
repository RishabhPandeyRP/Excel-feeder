import type { ExtractionRow, MasterSchema } from "@/types/schema";

/**
 * Clean strings:
 * - Null / empty / "null" / "undefined" / "-" / "nil" / "n/a" -> null (strictly empty)
 * - Explicit ditto marks ('"', '""', "''", ",,") -> '"'
 * - Real values -> trimmed string
 */
function cleanString(value: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();

  if (
    trimmed === "" ||
    lower === "null" ||
    lower === "undefined" ||
    trimmed === "-" ||
    trimmed === "--" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "nil"
  ) {
    return null;
  }

  if (trimmed === '"' || trimmed === '""' || trimmed === "''" || trimmed === ",,") {
    return '"';
  }

  return trimmed;
}

/** Check if text specifically indicates a repetition of the row above */
function isDittoToken(value: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return (
    v === '"' ||
    v === '""' ||
    v === "''" ||
    v === "„" ||
    v === "”" ||
    v === "“" ||
    v === ",," ||
    v === "do" ||
    v === "do." ||
    v === "ditto" ||
    v === "same" ||
    v === "same as above" ||
    v === "as above"
  );
}

function normalizeDate(value: string | null) {
  if (!value || isDittoToken(value)) return value;
  const v = value.trim();
  const iso = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const dmy = v.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmy) {
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return v;
}

function normalizeNumber(value: string | null) {
  if (!value || isDittoToken(value)) return value;
  const cleaned = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0];
  return cleaned ?? value;
}

function normalizeMobile(value: string | null) {
  if (!value || isDittoToken(value)) return value;
  const digits = value.replace(/\D/g, "");
  return digits || null;
}

export function normalizeRows(rows: ExtractionRow[], master: MasterSchema): ExtractionRow[] {
  return rows.map((row) => {
    const out: ExtractionRow = {};
    for (const column of master.columns) {
      let value = cleanString(row[column.key] ?? null);

      if (value == null) {
        out[column.key] = null;
        continue;
      }

      if (isDittoToken(value)) {
        out[column.key] = '"';
        continue;
      }

      if (value && column.key !== "mobile") value = value.trim();
      if (column.type === "date") value = normalizeDate(value);
      if (column.type === "number") value = normalizeNumber(value);
      if (column.key === "mobile") value = normalizeMobile(value);
      out[column.key] = value;
    }
    return out;
  });
}

/** 
 * Convert repeated values or ditto tokens into a single quotation symbol (").
 * Fields with no value remain strictly null/empty.
 * Never writes 'same as above'.
 */
export function applyDittoRule(rows: ExtractionRow[], master: MasterSchema): ExtractionRow[] {
  const lastEffectiveValues: Record<string, string | null> = {};

  return rows.map((row, rowIndex) => {
    const out: ExtractionRow = { ...row };

    for (const column of master.columns) {
      const key = column.key;
      const current = row[key];

      // Never ditto registration serial numbers or IDs
      if (key === "rch_reg_no" || key === "s_no" || key === "rch_no") {
        continue;
      }

      // If cell has no value, it MUST remain empty (null), not ditto mark '"'
      if (current == null || current === "") {
        out[key] = null;
        lastEffectiveValues[key] = null;
        continue;
      }

      // Explicit ditto token from text
      if (isDittoToken(current)) {
        out[key] = '"';
        continue;
      }

      if (rowIndex === 0) {
        lastEffectiveValues[key] = current;
        continue;
      }

      const priorEffective = lastEffectiveValues[key];

      if (
        priorEffective != null &&
        priorEffective !== "" &&
        current.trim().toLowerCase() === priorEffective.trim().toLowerCase()
      ) {
        // Value is exactly same as above -> write " symbol
        out[key] = '"';
      } else {
        // New distinct non-empty value -> remember for future rows
        lastEffectiveValues[key] = current;
      }
    }

    return out;
  });
}
