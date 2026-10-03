import { NextResponse } from "next/server";
import { getMasterSchema } from "@/lib/master-schema";
import { normalizeRows, applyDittoRule } from "@/lib/normalize";
import { createExcel } from "@/lib/excel";
import type { SchemaType } from "@/types/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const schemaType: SchemaType =
      body?.schemaType === "child" || body?.schema === "child" ? "child" : "mother";
    const master = getMasterSchema(schemaType);

    if (!Array.isArray(body?.rows)) {
      return NextResponse.json({ error: "rows must be an array." }, { status: 400 });
    }

    const rows = body.rows.map((row: unknown) => {
      if (!row || typeof row !== "object") throw new Error("Invalid row.");
      const out: Record<string, string | null> = {};
      for (const c of master.columns) {
        const value = (row as Record<string, unknown>)[c.key];
        out[c.key] = value == null ? null : String(value);
      }
      return out;
    });

    const normalized = normalizeRows(rows, master);
    const finalRows = applyDittoRule(normalized, master);
    const buffer = await createExcel(master, finalRows);
    const filename = schemaType === "child" ? "RCH_Child_Tracking.xlsx" : "RCH_Pregnant_Women.xlsx";

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("/api/export error", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Excel generation failed." }, { status: 500 });
  }
}
