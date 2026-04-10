const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeHomeworkCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** 라우트·검색창: `4821` 또는 `HW-…` 전체 코드 */
export type HomeworkRouteInput =
  | { kind: "pin"; pin: string }
  | { kind: "full"; code: string };

/**
 * URL 세그먼트 또는 검색 입력을 파싱합니다.
 * - 1~4자리 숫자만 → 4자리 PIN (앞을 0으로 패딩)
 * - HW- 로 시작 → 전체 과제 코드
 */
export function parseHomeworkRouteParam(raw: string): HomeworkRouteInput | null {
  let t = raw.trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    /* ignore */
  }
  t = t.trim();
  if (!t) return null;
  if (/^HW-/i.test(t)) {
    const code = normalizeHomeworkCode(t);
    if (code.startsWith("HW-") && code.length >= 5) {
      return { kind: "full", code };
    }
    return null;
  }
  if (/^\d{1,4}$/.test(t)) {
    return { kind: "pin", pin: t.padStart(4, "0") };
  }
  const code = normalizeHomeworkCode(t);
  if (code.startsWith("HW-")) return { kind: "full", code };
  return null;
}

export function generateHomeworkCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return `HW-${s}`;
}
