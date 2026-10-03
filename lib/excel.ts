import ExcelJS from "exceljs";
import path from "node:path";
import fs from "node:fs";
import type { ExtractionRow, MasterSchema } from "@/types/schema";

/**
 * Clean cell values:
 * - Empty/null/undefined -> null (generates a completely empty cell in Excel)
 * - Ditto '"' -> '"'
 * - Numbers / Dates -> parsed
 */
function excelValue(value: string | null, type: string): { val: unknown; isDitto: boolean } {
  if (
    value == null ||
    value === "" ||
    value.toLowerCase() === "null" ||
    value.toLowerCase() === "undefined" ||
    value === "-"
  ) {
    return { val: null, isDitto: false };
  }
  if (value === '"' || value === '""') {
    return { val: '"', isDitto: true };
  }
  if (type === "number") {
    const n = Number(value);
    return { val: Number.isFinite(n) ? n : value, isDitto: false };
  }
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return { val: new Date(Date.UTC(y, m - 1, d)), isDitto: false };
  }
  return { val: value, isDitto: false };
}

export async function createExcel(master: MasterSchema, rows: ExtractionRow[]): Promise<Buffer> {
  const isChild = master.schemaType === "child";
  const childMasterPath = path.join(process.cwd(), "data", "child-master.xlsx");
  const motherMasterPath = path.join(process.cwd(), "data", "master.xlsx");
  const fallbackWorkbook = path.join(process.cwd(), "RCH FEEDING 03-10-2026 Karimganj+Dharau.xlsx");
  const workbook = new ExcelJS.Workbook();

  let sourceFile: string | null = null;
  if (isChild && fs.existsSync(childMasterPath)) {
    sourceFile = childMasterPath;
  } else if (!isChild && fs.existsSync(motherMasterPath)) {
    sourceFile = motherMasterPath;
  } else if (fs.existsSync(motherMasterPath)) {
    sourceFile = motherMasterPath;
  } else if (fs.existsSync(fallbackWorkbook)) {
    sourceFile = fallbackWorkbook;
  }

  if (sourceFile) {
    // 1. Load the original master workbook so ALL auxiliary sheets
    // (Help, Facility, Sub_Facility, Villages) and data validation rules are preserved!
    await workbook.xlsx.readFile(sourceFile);
  } else {
    // Fallback sheets if master is missing
    workbook.addWorksheet("Data_Sheet");
    workbook.addWorksheet("Help");
    workbook.addWorksheet("Facility");
    workbook.addWorksheet("Sub_Facility");
    workbook.addWorksheet("Villages");
  }

  let sheet = workbook.getWorksheet("Data_Sheet");
  if (!sheet) {
    sheet = workbook.addWorksheet("Data_Sheet");
  }

  // 2. Clear existing sample rows from row 2 onwards
  const oldRowCount = sheet.rowCount;
  for (let r = oldRowCount; r >= 2; r--) {
    sheet.spliceRows(r, 1);
  }

  // 3. Add extracted data rows
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const rowValues: unknown[] = [];
    const dittoCols: number[] = [];

    for (let c = 0; c < master.columns.length; c++) {
      const colMeta = master.columns[c];
      const parsed = excelValue(row[colMeta.key] ?? null, colMeta.type);
      rowValues.push(parsed.val); // null if empty, '"' if ditto
      if (parsed.isDitto) {
        dittoCols.push(c + 1); // 1-indexed column number
      }
    }

    const addedRow = sheet.addRow(rowValues);
    addedRow.height = 24;

    addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isDitto = dittoCols.includes(colNumber);

      cell.font = {
        name: "Calibri",
        size: 11,
        bold: isDitto,
        color: { argb: isDitto ? "FF334155" : "FF0F172A" },
      };

      if (isDitto) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (cell.value instanceof Date) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.numFmt = "dd/mm/yyyy";
      } else if (typeof cell.value === "number") {
        cell.alignment = { vertical: "middle", horizontal: "right" };
      } else if (cell.value != null && cell.value !== "") {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
