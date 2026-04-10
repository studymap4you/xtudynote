/**
 * 휴대폰 문자 앱용 `sms:번호?body=내용` 링크 생성.
 */
export function normalizeSmsDialString(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (t.startsWith("+")) {
    return `+${digits}`;
  }
  return digits;
}

export function buildHomeworkSmsHref(
  phoneRaw: string | null | undefined,
  homeworkCode: string,
  message: string
): string | null {
  const num = normalizeSmsDialString(phoneRaw);
  if (!num) return null;
  const code = homeworkCode.trim();
  const msg = message.trim();
  const body = `[과제 안내] ${code}\n\n${msg}`.trim();
  return `sms:${num}?body=${encodeURIComponent(body)}`;
}
