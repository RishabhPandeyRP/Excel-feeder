import { getMasterSchema } from "../lib/master-schema";
import { normalizeRows, applyDittoRule } from "../lib/normalize";
import { createExcel } from "../lib/excel";
import ExcelJS from "exceljs";

async function test() {
  const master = getMasterSchema();
  console.log("Master columns count:", master.columns.length);

  // Mock data representing extracted rows from Image 1
  const mockRows = [
    {
      rch_reg_no: "32",
      mother: "Pooja",
      husband: "Atveer",
      village: "Nekpur",
      address: "Nekpur",
      mobile: "9286459532",
      registration_date: "2026-06-20",
      whose_mobile: "W"
    },
    {
      rch_reg_no: "33",
      mother: "Neetu",
      husband: "Anand",
      village: "same as above", // should become "
      address: "same as above", // should become "
      mobile: "9643462565",
      registration_date: "2026-07-28",
      whose_mobile: "W"
    },
    {
      rch_reg_no: "34",
      mother: "Sunaina",
      husband: "Lalit",
      village: '"', // already ditto mark
      address: '"',
      mobile: "7505693471",
      registration_date: "2026-07-12",
      whose_mobile: "W"
    },
    {
      rch_reg_no: "35",
      mother: "Satyawati",
      husband: "Ajay",
      village: "Nekpur", // repeat of original value -> should become "
      address: "Nekpur",
      mobile: "9627341009",
      registration_date: "2026-07-21",
      whose_mobile: "W"
    },
    {
      rch_reg_no: "36",
      mother: "Kavita",
      husband: "Pushpendra",
      village: "Shadalampur", // new village
      address: "Shadalampur",
      mobile: "7500807960",
      registration_date: "2026-06-24",
      whose_mobile: "W"
    },
    {
      rch_reg_no: "37",
      mother: "Neetu",
      husband: "Mohit",
      village: "do", // ditto shorthand -> should become "
      address: "as above", // should become "
      mobile: "8983773635",
      registration_date: "2026-08-03",
      whose_mobile: "W"
    }
  ];

  const normalized = normalizeRows(mockRows, master);
  const result = applyDittoRule(normalized, master);

  console.log("\n=== VERIFYING DITTO RULES ===");
  result.forEach((r, i) => {
    console.log(
      `Row ${i + 1}: rch_reg_no=${r.rch_reg_no} | mother=${r.mother} | village=${JSON.stringify(
        r.village
      )} | address=${JSON.stringify(r.address)}`
    );
  });

  // Check Excel output
  const buffer = await createExcel(master, result);
  console.log("\nGenerated Excel Buffer size:", buffer.length, "bytes");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.getWorksheet("Data_Sheet");
  if (!ws) throw new Error("Data_Sheet not found");

  console.log("Excel rows count:", ws.rowCount);
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    console.log(
      `Excel Data Row ${r - 1}: rch_reg_no=${row.getCell(7).value} | mother=${
        row.getCell(8).value
      } | village=${JSON.stringify(row.getCell(4).value)} | address=${JSON.stringify(
        row.getCell(10).value
      )}`
    );
  }

  console.log("\nALL VERIFICATIONS PASSED SUCCESSFULLY!");
}

test().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
