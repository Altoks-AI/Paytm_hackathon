export const LEAD_STATUSES = ["new", "contacted", "qualified", "converted", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Normalize a phone number to E.164. Bare 10-digit numbers get the default country code (+91). Returns null if invalid. */
export function normalizePhone(raw: string | null | undefined, defaultCc = "91"): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  let d = s.replace(/\D/g, "");
  if (!d) return null;
  if (!s.startsWith("+")) {
    if (d.startsWith("00")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) d = defaultCc + d.slice(1);
    else if (d.length === 10) d = defaultCc + d;
  }
  if (d.length < 8 || d.length > 15 || d.startsWith("0")) return null;
  return "+" + d;
}

/** Minimal RFC4180-ish CSV parser: quoted fields, escaped quotes (""), commas/newlines inside quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

/** Parse CSV text into lead rows. Uses a header row (name/phone/email, any order) if present, else assumes name,phone,email. */
export function csvToLeads(text: string): { name: string; phone: string; email: string }[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  let idx = { name: 0, phone: 1, email: 2 };
  let body = rows;
  if (head.some((h) => h.includes("phone") || h === "name" || h.includes("email") || h.includes("mobile"))) {
    const find = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h.includes(k)));
    idx = { name: find("name"), phone: find("phone", "mobile", "number"), email: find("email", "mail") };
    body = rows.slice(1);
  }
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  return body.map((r) => ({ name: get(r, idx.name), phone: get(r, idx.phone), email: get(r, idx.email) }));
}

export function toCsv(rows: (string | null | undefined)[][]): string {
  const esc = (v: string | null | undefined) => {
    const s = v ?? "";
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export const isUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
