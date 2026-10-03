import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";

const workbookPath = path.join(process.cwd(), "data", "master.xlsx");
const outputPath = path.join(process.cwd(), "config", "master-schema.json");

const numberColumns = new Set(["rch_reg_no", "weight", "weight2"]);
const dateColumns = new Set(["age", "lmp_date", "registration_date", "anc_date", "tt_date"]);

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const data = workbook.getWorksheet("Data_Sheet");
  if (!data) throw new Error("Data_Sheet not found.");

  const headers = (data.getRow(1).values as unknown[]).slice(1).map(String);
  const columns = headers.map((key) => {
    const type = dateColumns.has(key) ? "date" : numberColumns.has(key) ? "number" : "string";
    const samples: unknown[] = [];
    for (let r = 2; r <= data.rowCount && samples.length < 8; r++) {
      const value = data.getRow(r).getCell(headers.indexOf(key) + 1).value;
      if (value != null && value !== "") {
        const normalized = toIso(value);
        if (!samples.some((x) => JSON.stringify(x) === JSON.stringify(normalized))) samples.push(normalized);
      }
    }
    return { key, type, samples };
  });

  const vocabulary = (sheetName: string, max = 1000) => {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return [];
    const values: string[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => {
      const v = cell.value;
      if (typeof v === "string" && v.trim() && v !== "ALL" && v !== "ALL___A" && !values.includes(v)) {
        values.push(v);
      }
    }));
    return values.slice(0, max);
  };

  const output = {
    version: 1,
    sourceWorkbook: path.basename(workbookPath),
    sheets: workbook.worksheets.map((s) => s.name),
    columns,
    vocabularies: {
      Facility: vocabulary("Facility"),
      Sub_Facility: vocabulary("Sub_Facility"),
      Villages: vocabulary("Villages", 1000),
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`Generated ${outputPath}`);
  console.log(`Columns: ${columns.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
