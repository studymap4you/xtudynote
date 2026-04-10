import emailjs from "@emailjs/browser";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 수신 주소로 쓸 수 있으면 trim·소문자 정규화된 문자열, 아니면 null.
 */
export function normalizeRecipientEmail(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (t.length < 5) return null;
  if (!EMAIL_RE.test(t)) return null;
  return t;
}

export function isEmailJsConfigured(): boolean {
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  return Boolean(
    publicKey &&
      serviceId &&
      templateId &&
      String(publicKey).trim() &&
      String(serviceId).trim() &&
      String(templateId).trim()
  );
}

export type HomeworkEmailRecipient = {
  name: string;
  email: string;
};

/**
 * 선택 학생별로 순차 발송. 템플릿 변수: email, to_name, homework_code, message
 * @see https://www.emailjs.com/docs/sdk/send/
 */
export async function sendHomeworkEmailsSequential(args: {
  recipients: HomeworkEmailRecipient[];
  homeworkCode: string;
  message: string;
}): Promise<void> {
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;

  if (
    !publicKey ||
    !serviceId ||
    !templateId ||
    !String(publicKey).trim() ||
    !String(serviceId).trim() ||
    !String(templateId).trim()
  ) {
    throw new Error(
      "EmailJS가 설정되지 않았습니다.\n" +
        ".env.local에 VITE_EMAILJS_PUBLIC_KEY, VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID를 넣고 개발 서버를 재시작하세요."
    );
  }

  if (args.recipients.length === 0) {
    throw new Error("발송 대상 학생이 없습니다.");
  }

  const failures: string[] = [];

  for (const raw of args.recipients) {
    const to = normalizeRecipientEmail(raw.email);
    const displayName = (raw.name ?? "").trim() || "학생";

    if (!to) {
      failures.push(`${displayName}: 이메일 주소가 올바르지 않습니다 (${String(raw.email ?? "")})`);
      continue;
    }

    try {
      const result = await emailjs.send(
        serviceId,
        templateId,
        {
          email: to,
          to_name: displayName,
          homework_code: args.homeworkCode,
          message: args.message,
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
