import * as XLSX from "xlsx";

export type ParsedRosterRow = {
  studentUid?: string;
  email?: string;
  name?: string;
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
} {
  const h = headers.map((x) => x.trim().toLowerCase());
  let iUid = -1;
  let iEmail = -1;
  let iName = -1;
  h.forEach((cell, i) => {
    const c = cell.replace(/\s+/g, "");
    if (c.includes("uid") || c === "id" || c === "firebase" || c === "userid" || c === "studentid") iUid = i;
    if (c.includes("email") || c === "mail") iEmail = i;
    if (c.includes("name") || c.includes("이름") || c === "displayname" || c === "학생명") iName = i;
  });
  return { iUid, iEmail, iName };
}

function rowsFromMatrix(matrix: string[][]): ParsedRosterRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map(normCell);
  const { iUid, iEmail, iName } = detectColumns(headers);
  const out: ParsedRosterRow[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const studentUid = iUid >= 0 ? normCell(row[iUid]) : "";
    const email = iEmail >= 0 ? normCell(row[iEmail]) : "";
    const name = iName >= 0 ? normCell(row[iName]) : "";
    if (!studentUid && !email && !name) continue;
    out.push({
      ...(studentUid ? { studentUid } : {}),
      ...(email ? { email } : {}),
      ...(name ? { name } : {}),
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
