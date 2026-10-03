"use client";

import { useMemo, useState } from "react";
import motherSchema from "@/config/master-schema.json";
import childSchema from "@/config/child-schema.json";
import type { SchemaType } from "@/types/schema";

interface ColumnDef {
  key: string;
  header?: string;
  type: string;
}

const SCHEMAS: Record<
  SchemaType,
  {
    name: string;
    shortName: string;
    icon: string;
    badgeClass: string;
    columns: ColumnDef[];
    description: string;
    sampleFilename: string;
  }
> = {
  child: {
    name: "Child Tracking Register",
    shortName: "Child Register",
    icon: "👶",
    badgeClass: "badge-green",
    columns: childSchema.columns as ColumnDef[],
    description: "8 official columns: S.No., * RCH No., * Child Name, * Mother, Husband, Address, Date of Birth, * Mobile.",
    sampleFilename: "RCH_Child_Tracking.xlsx",
  },
  mother: {
    name: "Pregnant Women Register (ANC)",
    shortName: "Pregnant Women (ANC)",
    icon: "🤰",
    badgeClass: "badge-purple",
    columns: motherSchema.columns as ColumnDef[],
    description: "24 official columns for ANC maternal care, LMP, TT doses, weight, and HRP risk.",
    sampleFilename: "RCH_Pregnant_Women.xlsx",
  },
};

const facilities = (motherSchema.vocabularies.Facility as string[]).filter((x: string) => x !== "ALL___A");
const subcenters = (motherSchema.vocabularies.Sub_Facility as string[]).filter(
  (x: string) => x && !x.startsWith("ALL___")
);

type Row = Record<string, string | null>;
type DetectedColumn = {
  source_label: string;
  master_key: string | null;
  confidence: number;
};

type Result = {
  detected_schema?: SchemaType;
  schema_confidence?: number;
  schema_reason?: string;
  columns?: ColumnDef[];
  rows: Row[];
  warnings: string[];
  detected_columns: DetectedColumn[];
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number>(0);

  // Schema preferences
  const [schemaMode, setSchemaMode] = useState<"auto" | SchemaType>("auto");
  const [activeSchema, setActiveSchema] = useState<SchemaType>("child");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const [facility, setFacility] = useState("");
  const [subcenter, setSubcenter] = useState("");

  const [result, setResult] = useState<Result | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Active columns based on current schema
  const activeColumns = useMemo(() => {
    return SCHEMAS[activeSchema]?.columns || SCHEMAS.mother.columns;
  }, [activeSchema]);

  // Handle file select & preview
  function onFileChange(selectedFile: File | null) {
    setFile(selectedFile);
    setRotation(0);
    if (selectedFile) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }

  function rotateLeft() {
    setRotation((prev) => (prev + 270) % 360);
  }

  function rotateRight() {
    setRotation((prev) => (prev + 90) % 360);
  }

  function updateCell(rowIndex: number, key: string, value: string) {
    if (!result) return;
    const newRows = result.rows.map((r, i) => (i === rowIndex ? { ...r, [key]: value } : r));
    setResult({ ...result, rows: newRows });
  }

  function addRow() {
    if (!result) return;
    const emptyRow: Row = {};
    for (const c of activeColumns) {
      emptyRow[c.key] = null;
    }
    setResult({ ...result, rows: [...result.rows, emptyRow] });
  }

  function deleteRow(index: number) {
    if (!result) return;
    const newRows = result.rows.filter((_, i) => i !== index);
    setResult({ ...result, rows: newRows });
  }

  function switchSchema(newSchema: SchemaType) {
    setActiveSchema(newSchema);
    if (result) {
      // Re-align rows to newly selected schema
      const targetCols = SCHEMAS[newSchema].columns;
      const remappedRows = result.rows.map((r) => {
        const out: Row = {};
        for (const col of targetCols) {
          out[col.key] = r[col.key] ?? null;
        }
        return out;
      });
      setResult({ ...result, detected_schema: newSchema, rows: remappedRows });
    }
  }

  async function analyze() {
    setError("");
    setStatus("");
    if (!file) {
      setError("Please select a register image first.");
      return;
    }

    setBusy(true);
    setStatus("Analyzing image, inspecting handwriting/columns, and matching schema...");

    try {
      const form = new FormData();
      form.append("image", file);
      if (rotation > 0) form.append("rotation", String(rotation));
      if (facility) form.append("facility", facility);
      if (subcenter) form.append("subcenter", subcenter);
      if (schemaMode !== "auto") form.append("schema", schemaMode);

      const res = await fetch("/api/analyze", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed.");

      const detected = (data.detected_schema as SchemaType) || "mother";
      setActiveSchema(detected);
      setResult(data);

      const schemaInfo = SCHEMAS[detected];
      setStatus(
        `Successfully matched "${schemaInfo.name}" (${schemaInfo.columns.length} columns) and extracted ${data.rows.length} row(s).`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!result) return;
    setError("");
    setBusy(true);
    const schemaInfo = SCHEMAS[activeSchema];
    setStatus(`Generating official ${schemaInfo.name} Excel workbook (preserving all 5 sheets)...`);

    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: result.rows,
          schemaType: activeSchema,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Excel export failed.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download =
        activeSchema === "child"
          ? `RCH_CHILD_TRACKING_${dateStr}.xlsx`
          : `RCH_PREGNANT_WOMEN_${dateStr}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Master Excel workbook (.xlsx) downloaded successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Excel export failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      {/* Top Navbar */}
      <header className="top-nav">
        <div className="brand">
          <div className="brand-icon">R</div>
          <div>
            <h1 className="brand-title">RCH Image → Excel AI Studio</h1>
            <p className="brand-subtitle">
              Dual-Schema AI: Auto-detects <strong>Child Tracking</strong> (8 cols) &amp;{" "}
              <strong>Pregnant Women ANC</strong> (24 cols) registers
            </p>
          </div>
        </div>
        <div className="nav-badges">
          <span className="badge badge-green">👶 Child Schema (8 Cols)</span>
          <span className="badge badge-purple">🤰 Pregnant Women (24 Cols)</span>
          <span className="badge badge-ditto">&quot; = Auto-Ditto Mark</span>
        </div>
      </header>

      {/* Upload & Context Section */}
      <section className="card">
        <h2 className="card-title">
          <span>📸</span> Upload Register Photo &amp; Schema Selection
        </h2>

        {/* Schema Mode Selector */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Target Schema Mode
          </label>
          <div className="schema-selector-group">
            <button
              type="button"
              className={`schema-card-btn ${schemaMode === "auto" ? "active-auto" : ""}`}
              onClick={() => setSchemaMode("auto")}
            >
              <div className="schema-card-title">
                <span>⚡</span>
                <span>Auto-Detect (Recommended)</span>
              </div>
              <div className="schema-card-desc">
                AI analyzes handwriting &amp; columns to pick Child or Mother schema
              </div>
            </button>

            <button
              type="button"
              className={`schema-card-btn ${schemaMode === "child" ? "active-child" : ""}`}
              onClick={() => {
                setSchemaMode("child");
                setActiveSchema("child");
              }}
            >
              <div className="schema-card-title">
                <span>👶</span>
                <span>Child Register (8 Columns)</span>
              </div>
              <div className="schema-card-desc">
                Child Name, DOB, Parents, Address, Mobile
              </div>
            </button>

            <button
              type="button"
              className={`schema-card-btn ${schemaMode === "mother" ? "active-mother" : ""}`}
              onClick={() => {
                setSchemaMode("mother");
                setActiveSchema("mother");
              }}
            >
              <div className="schema-card-title">
                <span>🤰</span>
                <span>Pregnant Women (24 Columns)</span>
              </div>
              <div className="schema-card-desc">
                Full ANC tracking: LMP, ANC dates, TT doses, Weight, HRP
              </div>
            </button>
          </div>
        </div>

        {/* Optional Context Dropdowns */}
        <div className="grid-2" style={{ marginBottom: 18 }}>
          <div className="field">
            <label>Facility (APHC) Context (Optional)</label>
            <select value={facility} onChange={(e) => setFacility(e.target.value)}>
              <option value="">Auto-detect / Not specified</option>
              {facilities.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Sub-Center Context (Optional)</label>
            <select value={subcenter} onChange={(e) => setSubcenter(e.target.value)}>
              <option value="">Auto-detect / Not specified</option>
              {subcenters.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Upload & Preview */}
        <div className="upload-grid">
          <div>
            <label className={`drop-zone ${file ? "active" : ""}`}>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
              <div className="drop-icon">📁</div>
              <div className="drop-title">{file ? file.name : "Click to select or drag register photo"}</div>
              <div className="drop-subtitle">
                Supports child tracking notebooks (8 cols) or pregnant women ledgers (24 cols), Hindi/English handwriting or print.
              </div>
            </label>
          </div>

          <div className="preview-pane">
            <div className="preview-img-wrap">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Upload preview"
                  style={{ transform: `rotate(${rotation}deg)` }}
                />
              ) : (
                <div style={{ color: "#94a3b8", fontSize: "13px" }}>No photo selected yet</div>
              )}
            </div>
            <div className="preview-controls">
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                {file ? `${(file.size / 1024).toFixed(0)} KB • ${rotation}°` : "Rotate if sideways"}
              </span>
              <div className="rotate-btns">
                <button
                  type="button"
                  className="btn-icon"
                  onClick={rotateLeft}
                  disabled={!file}
                  title="Rotate Counter-Clockwise 90°"
                >
                  ⟲ Left
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={rotateRight}
                  disabled={!file}
                  title="Rotate Clockwise 90°"
                >
                  ⟳ Right
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="action-bar">
          <button className="btn btn-primary" onClick={analyze} disabled={busy || !file}>
            {busy ? (
              <>
                <div className="spinner" /> Analyzing Image &amp; Matching Schema...
              </>
            ) : (
              <>⚡ Analyze Register Image</>
            )}
          </button>

          {result && (
            <button className="btn btn-success" onClick={download} disabled={busy}>
              📥 Download {SCHEMAS[activeSchema].shortName} Excel (.xlsx)
            </button>
          )}
        </div>

        {status && <div className="alert alert-info">ℹ️ {status}</div>}
        {error && <div className="alert alert-danger">⚠️ {error}</div>}

        {/* Detected Schema Callout Banner */}
        {result?.detected_schema && (
          <div
            className={`detected-banner ${
              result.detected_schema === "child" ? "detected-banner-child" : "detected-banner-mother"
            }`}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "20px" }}>{SCHEMAS[result.detected_schema].icon}</span>
                <strong style={{ fontSize: "15px" }}>
                  AI MATCHED: {SCHEMAS[result.detected_schema].name.toUpperCase()} (
                  {SCHEMAS[result.detected_schema].columns.length} COLS)
                </strong>
                {result.schema_confidence && (
                  <span className={`badge ${SCHEMAS[result.detected_schema].badgeClass}`}>
                    {Math.round(result.schema_confidence * 100)}% Match
                  </span>
                )}
              </div>
              {result.schema_reason && (
                <div style={{ fontSize: "13px", marginTop: "4px", opacity: 0.9 }}>
                  <strong>Detection Analysis:</strong> {result.schema_reason}
                </div>
              )}
            </div>

            <div className="schema-switch-row">
              <span style={{ fontSize: "12px", fontWeight: 600 }}>Switch Schema:</span>
              <div className="badge-group" style={{ display: "flex", gap: "6px" }}>
                <button
                  type="button"
                  className={`badge ${activeSchema === "child" ? "badge-green" : "badge-blue"}`}
                  style={{ cursor: "pointer", border: activeSchema === "child" ? "2px solid #16a34a" : "1px solid #cbd5e1" }}
                  onClick={() => switchSchema("child")}
                >
                  👶 Child (8 Cols)
                </button>
                <button
                  type="button"
                  className={`badge ${activeSchema === "mother" ? "badge-purple" : "badge-blue"}`}
                  style={{ cursor: "pointer", border: activeSchema === "mother" ? "2px solid #9333ea" : "1px solid #cbd5e1" }}
                  onClick={() => switchSchema("mother")}
                >
                  🤰 Mother (24 Cols)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Detected Columns Mapping */}
        {result?.detected_columns?.length ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-muted)" }}>
              DETECTED IMAGE COLUMNS → {SCHEMAS[activeSchema].name.toUpperCase()} MAPPING:
            </div>
            <div className="col-tags">
              {result.detected_columns.map((dc, i) => (
                <div key={i} className="col-tag">
                  <strong>{dc.source_label}</strong> → <span>{dc.master_key || "unmapped"}</span>
                  <small style={{ color: "#94a3b8" }}>({Math.round((dc.confidence ?? 1) * 100)}%)</small>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {result?.warnings?.length ? (
          <div className="alert alert-warning" style={{ marginTop: 14 }}>
            <div>
              <strong>Review Notices:</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </section>

      {/* Review & Edit Section */}
      {result && (
        <section className="card">
          <div className="table-header-wrap">
            <div>
              <h2 className="card-title" style={{ margin: 0 }}>
                <span>📊</span> Review &amp; Edit Extracted Records ({SCHEMAS[activeSchema].shortName})
              </h2>
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                All Hindi names transliterated into English script. Consecutive repeats display quotation mark (
                <strong>&quot;</strong>). Empty cells remain completely blank.
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              {/* View Mode Toggle: Table or Mobile Cards */}
              <div className="view-toggle-bar">
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === "table" ? "active" : ""}`}
                  onClick={() => setViewMode("table")}
                  title="Table View (Full Grid)"
                >
                  <span>📊</span> Table
                </button>
                <button
                  type="button"
                  className={`view-toggle-btn ${viewMode === "cards" ? "active" : ""}`}
                  onClick={() => setViewMode("cards")}
                  title="Mobile Cards View"
                >
                  <span>📱</span> Cards
                </button>
              </div>
              <span className="badge badge-ditto">&quot; = Ditto</span>
              <span className={`badge ${SCHEMAS[activeSchema].badgeClass}`}>
                {SCHEMAS[activeSchema].icon} {SCHEMAS[activeSchema].columns.length} Cols
              </span>
              <span className="badge badge-blue">{result.rows.length} Rows</span>
            </div>
          </div>

          {/* Swipe Hint for mobile users on Table view */}
          {viewMode === "table" && (
            <div className="swipe-hint">
              <span>👉</span>
              <span>Swipe table horizontally to view and edit all {SCHEMAS[activeSchema].columns.length} columns</span>
            </div>
          )}

          {/* TABLE VIEW */}
          {viewMode === "table" && (
            <div className="table-wrap">
              <table className={activeSchema === "child" ? "table-child" : "table-mother"}>
                <thead>
                  <tr>
                    <th className="row-num">#</th>
                    {activeColumns.map((c) => (
                      <th key={c.key} title={`Key: ${c.key} (${c.type})`}>
                        <div>{c.header || c.key}</div>
                        <div style={{ fontSize: "10px", fontWeight: 400, opacity: 0.8 }}>{c.key}</div>
                      </th>
                    ))}
                    <th style={{ width: 60 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, ri) => (
                    <tr key={ri}>
                      <td className="row-num">{ri + 1}</td>
                      {activeColumns.map((c) => {
                        const raw = row[c.key];
                        const val =
                          raw == null ||
                          raw === "null" ||
                          raw === "undefined" ||
                          raw === "-" ||
                          raw === "--"
                            ? ""
                            : raw;
                        const isDitto = val === '"';
                        return (
                          <td key={c.key} className={isDitto ? "is-ditto" : ""}>
                            <input
                              type="text"
                              value={val}
                              onChange={(e) => updateCell(ri, c.key, e.target.value)}
                              placeholder=""
                            />
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => deleteRow(ri)}
                          style={{
                            background: "transparent",
                            border: "none",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontWeight: "bold",
                            padding: "6px 8px",
                          }}
                          title="Delete Row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* MOBILE CARDS VIEW */}
          {viewMode === "cards" && (
            <div className="cards-list">
              {result.rows.map((row, ri) => {
                const titleLabel =
                  activeSchema === "child"
                    ? row.child_name || `Child #${ri + 1}`
                    : row.mother || `Mother #${ri + 1}`;
                return (
                  <div key={ri} className="record-card">
                    <div className="record-card-header">
                      <div className="record-card-title">
                        <span className="badge badge-blue">#{ri + 1}</span>
                        <strong>{titleLabel}</strong>
                        {row.address && row.address !== '"' && (
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>• {row.address}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteRow(ri)}
                        style={{
                          background: "#fee2e2",
                          border: "1px solid #fca5a5",
                          borderRadius: "4px",
                          color: "#b91c1c",
                          cursor: "pointer",
                          fontWeight: 700,
                          fontSize: "12px",
                          padding: "4px 10px",
                        }}
                        title="Delete Record"
                      >
                        ✕ Delete
                      </button>
                    </div>

                    <div className="record-card-body">
                      {activeColumns.map((c) => {
                        const raw = row[c.key];
                        const val =
                          raw == null ||
                          raw === "null" ||
                          raw === "undefined" ||
                          raw === "-" ||
                          raw === "--"
                            ? ""
                            : raw;
                        const isDitto = val === '"';
                        return (
                          <div key={c.key} className="record-card-field">
                            <label className="record-card-label">{c.header || c.key}</label>
                            <input
                              type="text"
                              className={`record-card-input ${isDitto ? "is-ditto" : ""}`}
                              value={val}
                              onChange={(e) => updateCell(ri, c.key, e.target.value)}
                              placeholder=""
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="table-footer">
            <button type="button" className="btn btn-secondary" onClick={addRow}>
              + Add New Row
            </button>
            <button type="button" className="btn btn-success" onClick={download} disabled={busy}>
              📥 Download {SCHEMAS[activeSchema].shortName} Excel (.xlsx)
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
