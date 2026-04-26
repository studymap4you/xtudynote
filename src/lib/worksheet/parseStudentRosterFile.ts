import * as XLSX from "xlsx";

export type ParsedRosterRow = {
  studentUid?: string;
  email?: string;
  name?: string;
  phone?: string;
};

function normCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v).trim();
  return String(v).trim();
}

function detectColumns(headers: string[]): {
  iUid: number;
  iEmail: number;
  iName: number;
  iPhone: number;
} {
  const h = headers.map((x) => x.trim().toLowerCase());
  let iUid = -1;
  let iEmail = -1;
  let iName = -1;
  let iPhone = -1;
  h.forEach((cell, i) => {
    const c = cell.replace(/\s+/g, "");
    if (c.includes("uid") || c === "id" || c === "firebase" || c === "userid" || c === "studentid") iUid = i;
    if (c.includes("email") || c === "mail") iEmail = i;
    if (c.includes("name") || c.includes("이름") || c === "displayname" || c === "학생명" || c.includes("별명")) iName = i;
    if (
      c.includes("phone") ||
      c.includes("mobile") ||
      c.includes("tel") ||
      c.includes("전화") ||
      c.includes("휴대") ||
      c.includes("연락처")
    )
      iPhone = i;
  });
  return { iUid, iEmail, iName, iPhone };
}

function rowsFromMatrix(matrix: string[][]): ParsedRosterRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(normCell);
  const { iUid, iEmail, iName, iPhone } = detectColumns(headers);
  const out: ParsedRosterRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const studentUid = iUid >= 0 ? normCell(row[iUid]) : "";
    const email = iEmail >= 0 ? normCell(row[iEmail]) : "";
    const name = iName >= 0 ? normCell(row[iName]) : "";
    const phone = iPhone >= 0 ? normCell(row[iPhone]) : "";
    if (!studentUid && !email && !name && !phone) continue;
    out.push({
      ...(studentUid ? { studentUid } : {}),
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
      ...(phone ? { phone } : {}),
    });
  }
  return out;
}

/** 간단 CSV (쉼표 구분, 따옴표 미지원 복잡 패턴은 한 칸에 UID만 권장) */
export function parseCsvToMatrix(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const matrix: string[][] = [];
  for (const line of lines) {
    if (!line) continue;
    matrix.push(line.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  }
  return matrix;
}

export async function parseStudentRosterFile(file: File): Promise<ParsedRosterRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const text = await file.text();
    return rowsFromMatrix(parseCsvToMatrix(text));
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" }) as string[][];
    const asStrings = matrix.map((row) => row.map((cell) => normCell(cell)));
    return rowsFromMatrix(asStrings);
  }
  throw new Error("지원 형식: .csv, .xlsx, .xls 입니다.");
}

/** 연락처 명단(이름·전화·이메일)용 — 동일 파서, UID 열은 무시해도 됨 */
export async function parseContactRosterFile(
  file: File,
): Promise<{ displayName: string; phone: string; email: string }[]> {
  const raw = await parseStudentRosterFile(file);
  return raw
    .map((r) => ({
      displayName: (r.name ?? "").trim(),
      phone: (r.phone ?? "").trim(),
      email: (r.email ?? "").trim().toLowerCase(),
    }))
    .filter((r) => r.displayName || r.phone || r.email);
}
