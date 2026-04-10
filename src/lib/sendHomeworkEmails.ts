import emailjs from "@emailjs/browser";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 * 수신(To) 템플릿 변수명은 반드시 `email` — homework_code, message, to_name 동봉.
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
        ".env.local에 VITE_EMAILJS_PUBLIC_KEY, VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID를 설정하세요."
    );
  }

  if (args.recipients.length === 0) {
    throw new Error("발송할 이메일 대상이 없습니다.");
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
