import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import "@/pages/pages.css";

type FormState = {
  unit: string;
  objectives: string;
  studyDate: string;
  content: string;
  exercises: string;
  summary: string;
  teacherName: string;
};

const emptyForm = (): FormState => ({
  unit: "",
  objectives: "",
  studyDate: "",
  content: "",
  exercises: "",
  summary: "",
  teacherName: "",
});

function worksheetPdfEndpoint(): string {
  const explicit = import.meta.env.VITE_WORKSHEET_PDF_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const pid =
    import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() ||
    import.meta.env.VITE_FIREBASE_PROJECTID?.trim() ||
    "xtudynote";
  return `https://asia-northeast3-${pid}.cloudfunctions.net/generateWorksheetPdf`;
}

function parseFilenameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/"/g, ""));
    } catch {
      return star[1];
    }
  }
  const q = /filename="([^"]+)"/i.exec(header);
  return q?.[1] ?? null;
}

export function WorksheetPdfForm() {
  const { profile } = useAuth();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const endpoint = useMemo(() => worksheetPdfEndpoint(), []);

  useEffect(() => {
    const dn = profile?.displayName?.trim();
    const em = profile?.email?.trim();
    if (!dn && !em) return;
    setForm((f) => (f.teacherName.trim() ? f : { ...f, teacherName: dn || em || "" }));
  }, [profile?.displayName, profile?.email]);

  const update = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const downloadPdf = useCallback(async () => {
    setErr(null);
    setMsg(null);
    const unit = form.unit.trim();
    const teacherName = form.teacherName.trim();
    if (!unit || !teacherName) {
      setErr("학습단원과 선생님 성함은 필수입니다.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit,
          objectives: form.objectives.trim(),
          studyDate: form.studyDate.trim(),
          content: form.content.trim(),
          exercises: form.exercises.trim(),
          summary: form.summary.trim(),
          teacherName,
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `서버 오류 (${res.status})`);
      }
      const cd = res.headers.get("Content-Disposition");
      let filename = parseFilenameFromDisposition(cd) || `${form.studyDate || "날짜"}_${teacherName}_${unit}.pdf`;
      filename = filename.replace(/[/\\?%*:|"<>]/g, "_");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg("PDF가 저장되었습니다. 브라우저 기본 다운로드 폴더를 확인해 주세요.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "PDF를 받지 못했습니다. Cloud Functions 배포·CORS를 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }, [endpoint, form]);

  return (
    <section id="worksheet-pdf" className="worksheet-pdf" aria-labelledby="worksheet-pdf-title">
      <div className="worksheet-pdf__inner">
        <h2 id="worksheet-pdf-title" className="worksheet-pdf__title">
          <span className="worksheet-pdf__title-en">Worksheet PDF</span>
          <span className="worksheet-pdf__title-ko">학습지 PDF 자동 생성</span>
        </h2>
        <p className="worksheet-pdf__lede ui-ko">
          입력한 내용으로 A4 학습지 PDF를 만들어 바로 저장합니다. 서버에서 Pretendard 폰트가 임베드되며, 헤더·푸터
          브랜딩이 포함됩니다.
        </p>

        <div className="worksheet-pdf__grid">
          <label className="worksheet-pdf__field">
            <span className="worksheet-pdf__label">학습단원</span>
            <input
              className="worksheet-pdf__control"
              value={form.unit}
              onChange={(e) => update("unit", e.target.value)}
              placeholder="예: 수능 영어 독해 — 인과·추론"
              autoComplete="off"
            />
          </label>
          <label className="worksheet-pdf__field">
            <span className="worksheet-pdf__label">학습목표</span>
            <textarea
              className="worksheet-pdf__textarea"
              rows={2}
              value={form.objectives}
              onChange={(e) => update("objectives", e.target.value)}
              placeholder="이번 시간에 달성할 목표를 적어 주세요."
            />
          </label>
          <label className="worksheet-pdf__field">
            <span className="worksheet-pdf__label">학습일자</span>
            <input
              className="worksheet-pdf__control"
              type="date"
              value={form.studyDate}
              onChange={(e) => update("studyDate", e.target.value)}
            />
          </label>
          <label className="worksheet-pdf__field">
            <span className="worksheet-pdf__label">학습내용</span>
            <textarea
              className="worksheet-pdf__textarea worksheet-pdf__textarea--tall"
              rows={6}
              value={form.content}
              onChange={(e) => update("content", e.target.value)}
              placeholder="본문에 들어갈 학습 내용입니다. (PDF 본문 11pt, 줄간격 1.6)"
            />
          </label>
          <label className="worksheet-pdf__field">
            <span className="worksheet-pdf__label">확인문제</span>
            <textarea
              className="worksheet-pdf__textarea"
              rows={4}
              value={form.exercises}
              onChange={(e) => update("exercises", e.target.value)}
              placeholder="문항·선지 등을 적어 주세요."
            />
          </label>
          <label className="worksheet-pdf__field">
            <span className="worksheet-pdf__label">핵심요약</span>
            <textarea
              className="worksheet-pdf__textarea"
              rows={3}
              value={form.summary}
              onChange={(e) => update("summary", e.target.value)}
              placeholder="한 줄 요약·키워드 등"
            />
          </label>
          <label className="worksheet-pdf__field">
            <span className="worksheet-pdf__label">선생님 성함</span>
            <input
              className="worksheet-pdf__control"
              value={form.teacherName}
              onChange={(e) => update("teacherName", e.target.value)}
              placeholder="헤더 브랜딩에 표시됩니다."
              autoComplete="name"
            />
          </label>
        </div>

        {err ? (
          <p className="worksheet-pdf__err" role="alert">
            {err}
          </p>
        ) : null}
        {msg ? (
          <p className="worksheet-pdf__ok" role="status">
            {msg}
          </p>
        ) : null}

        <div className="worksheet-pdf__actions">
          <button
            type="button"
            className="btn btn--primary btn--stack worksheet-pdf__submit"
            disabled={busy}
            onClick={() => void downloadPdf()}
          >
            {busy ? "생성 중…" : "PDF 생성 및 다운로드"}
          </button>
        </div>
        <p className="worksheet-pdf__hint ui-ko">
          파일명: [날짜]_[선생님성함]_[학습단원].pdf · 학원 로고는{" "}
          <code className="worksheet-pdf__code">functions/assets/logo.png</code> 로 넣으면 헤더에 표시됩니다.
        </p>
      </div>
    </section>
  );
}
