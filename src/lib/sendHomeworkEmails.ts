import emailjs from "@emailjs/browser";

/** 로컬@도메인 형식 (EmailJS 수신 주소용) */
const RECIPIENT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 선택 학생의 email 필드를 발송 전에 한 번 더 검사할 때 사용합니다.
 * @returns 유효하면 소문자·trim된 주소, 아니면 null
 */
export function normalizeRecipientEmail(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (t.length < 5) return null;
  if (!RECIPIENT_EMAIL_RE.test(t)) return null;
  const at = t.indexOf("@");
  if (at <= 0 || at >= t.length - 1) return null;
  const domain = t.slice(at + 1);
  if (!domain.includes(".")) return null;
  return t;
}

/**
 * EmailJS 템플릿에 다음 변수를 사용하세요 (Content):
 * - {{email}}  수신 학생 이메일 — To 필드에 반드시 {{email}} 사용 (변수명 고정)
 * - {{to_name}}   학생 이름
 * - {{homework_code}}  과제번호
 * - {{message}}   선생님이 입력한 안내 전문
 * - {{teacher_email}}  발신/회신용 선생님 이메일
 * - {{reply_to}}  Reply-To (선택)
 */

export function isEmailJsConfigured(): boolean {
  const k = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
  const s = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const t = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  return Boolean(k && s && t && String(k).length > 0 && String(s).length > 0 && String(t).length > 0);
}

export type HomeworkEmailRecipient = {
  name: string;
  email: string;
};

export async function sendHomeworkEmailsSequential(args: {
  recipients: HomeworkEmailRecipient[];
  homeworkCode: string;
  message: string;
  teacherEmail: string;
}): Promise<void> {
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;

  if (!isEmailJsConfigured() || !publicKey || !serviceId || !templateId) {
    throw new Error(
      "EmailJS가 설정되지 않았습니다.\n" +
        ".env.local에 VITE_EMAILJS_PUBLIC_KEY, VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID를 넣고 개발 서버를 재시작하세요."
    );
  }

  if (args.recipients.length === 0) {
    throw new Error("발송 대상 학생이 없습니다.");
  }

  const failures: string[] = [];

  for (let i = 0; i < args.recipients.length; i++) {
    const raw = args.recipients[i];
    const to = normalizeRecipientEmail(raw.email);
    const name = (raw.name ?? "").trim() || "학생";

    if (!to) {
      failures.push(`${name}: 이메일 주소가 올바르지 않습니다 (${String(raw.email ?? "")})`);
      continue;
    }

    try {
      const result = await emailjs.send(
        serviceId,
        templateId,
        {
          email: to,
          to_name: name,
          homework_code: args.homeworkCode,
          message: args.message,
          teacher_email: args.teacherEmail,
          reply_to: args.teacherEmail,
        },
        { publicKey }
      );

      if (result.status < 200 || result.status >= 300) {
        failures.push(`${to}: EmailJS 응답 오류 (HTTP ${result.status}) ${result.text ?? ""}`);
      }
    } catch (e: unknown) {
      const detail =
        e && typeof e === "object" && "text" in e
          ? String((e as { text?: string }).text)
          : e instanceof Error
            ? e.message
            : String(e);
      failures.push(`${to}: ${detail}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
}
