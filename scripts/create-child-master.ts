import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import path from "node:path";

async function createChildMaster() {
  const masterPath = path.join(process.cwd(), "data", "master.xlsx");
  const childMasterPath = path.join(process.cwd(), "data", "child-master.xlsx");
  const childSchemaPath = path.join(process.cwd(), "config", "child-schema.json");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(masterPath);

  // 1. Get or create Data_Sheet
  let dataSheet = wb.getWorksheet("Data_Sheet");
  if (!dataSheet) {
    dataSheet = wb.addWorksheet("Data_Sheet");
  } else {
    // Clear all rows
    const count = dataSheet.rowCount;
    for (let r = count; r >= 1; r--) {
      dataSheet.spliceRows(r, 1);
    }
  }

  // 2. Child Master Columns (from child.jpeg)
  const childColumns = [
    { key: "s_no", header: "S.No.", width: 10, type: "number" },
    { key: "rch_no", header: "* RCH No.", width: 22, type: "string" },
    { key: "child_name", header: "* Child Name", width: 24, type: "string" },
    { key: "mother", header: "* Mother", width: 22, type: "string" },
    { key: "husband", header: "Husband", width: 22, type: "string" },
    { key: "address", header: "Address", width: 22, type: "string" },
    { key: "dob", header: "Date of Birth", width: 18, type: "date" },
    { key: "mobile", header: "* Mobile", width: 18, type: "string" },
  ];

  dataSheet.columns = childColumns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  // Style Header Row
  const headerRow = dataSheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A8A" }, // Navy Blue
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCBD5E1" } },
      left: { style: "thin", color: { argb: "FFCBD5E1" } },
      bottom: { style: "medium", color: { argb: "FF0F172A" } },
      right: { style: "thin", color: { argb: "FFCBD5E1" } },
    };
  });

  dataSheet.views = [{ state: "frozen", ySplit: 1 }];

  // 3. Save child-master.xlsx (contains Data_Sheet + Help + Facility + Sub_Facility + Villages)
  await wb.xlsx.writeFile(childMasterPath);
  console.log(`Created ${childMasterPath}`);

  // 4. Create child-schema.json
  const vocabulary = (sheetName: string, max = 500) => {
    const sheet = wb.getWorksheet(sheetName);
    if (!sheet) return [];
    const values: string[] = [];
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        const v = cell.value;
        if (typeof v === "string" && v.trim() && v !== "ALL" && v !== "ALL___A" && !values.includes(v)) {
          values.push(v);
        }
      })
    );
    return values.slice(0, max);
  };

  const schemaJson = {
    version: 1,
    schemaType: "child",
    title: "Child Register Schema",
    sourceWorkbook: "child-master.xlsx",
    sheets: wb.worksheets.map((s) => s.name),
    columns: childColumns.map((c) => ({
      key: c.key,
      header: c.header,
      type: c.type,
      samples: [],
    })),
    vocabularies: {
      Facility: vocabulary("Facility", 30),
      Sub_Facility: vocabulary("Sub_Facility", 50),
      Villages: vocabulary("Villages", 300),
    },
  };

  await fs.writeFile(childSchemaPath, JSON.stringify(schemaJson, null, 2), "utf8");
  console.log(`Created ${childSchemaPath}`);
}

createChildMaster().catch(console.error);
