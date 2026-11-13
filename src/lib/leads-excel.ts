// Excel (.xlsx) lead import/template. Server-only (exceljs).
import ExcelJS from "exceljs";
import { IMPORT_COLUMNS } from "./leads";

/** First worksheet as rows of strings. */
export async function xlsxToRows(data: ArrayBuffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const out: string[] = [];
    for (let c = 1; c <= Math.max(row.cellCount, IMPORT_COLUMNS.length); c++) out.push(cellText(row.getCell(c)));
    rows.push(out);
  });
  return rows;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v); // phones typed as numbers, no 9.87E+09
  if (typeof v === "object") {
    if ("text" in v && typeof v.text === "string") return v.text; // hyperlink / mailto
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return v.result == null ? "" : String(v.result); // formula
  }
  return cell.text ?? String(v);
}

/** Import template workbook with a header row, an example row and phone/text columns formatted as text. */
export async function leadTemplateXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Leads");
  ws.columns = [
    { header: "name", key: "name", width: 24 },
    { header: "phone", key: "phone", width: 18, style: { numFmt: "@" } },
    { header: "email", key: "email", width: 28 },
    { header: "notes", key: "notes", width: 40 },
    { header: "tags", key: "tags", width: 24 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.addRow({ name: "Priya Sharma", phone: "+919876543210", email: "priya@example.com", notes: "Interested in WhatsApp agent", tags: "hot, clinic" });
  ws.addRow({ name: "Ravi Kumar", phone: "9812345678", email: "", notes: "", tags: "" });
  const help = wb.addWorksheet("How to fill");
  help.getColumn(1).width = 100;
  for (const line of [
    "Fill the Leads sheet: one lead per row, keep the header row.",
    "phone is required. Use country code (+91...). 10-digit Indian numbers get +91 added automatically.",
    "name, email, notes are optional. tags: comma separated, e.g. hot, clinic.",
    "Existing leads with the same phone are updated, new phones are added. Delete the example rows before importing.",
  ])
    help.addRow([line]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
