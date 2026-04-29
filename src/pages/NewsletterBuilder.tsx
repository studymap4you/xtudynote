import { useCallback, useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { NewsletterEditModal } from "@/components/newsletter/NewsletterEditModal";
import { downloadNewsletterPdf } from "@/lib/englishPassage/englishPassagePdfClient";
import { requestNewsletterFromImage } from "@/lib/newsletter/requestNewsletterFromImage";
import type { NewsletterAiResult, NewsletterPurpose } from "@/types/newsletter";
import { useAuth } from "@/contexts/AuthContext";
import styles from "./newsletter-builder.module.css";

const PURPOSES: { value: NewsletterPurpose; labelKo: string }[] = [
  { value: "parent_monthly", labelKo: "월간 학부모 소식" },
  { value: "teacher_tip", labelKo: "교사·튜터 팁" },
  { value: "student_motivation", labelKo: "학습자 동기·루틴" },
  { value: "brand_story", labelKo: "브랜드·서비스 소개" },
];

function displayBody(raw: string): string {
  return raw.replace(/\\n/g, "\n").replace(/\*\*/g, "");
}

export function NewsletterBuilderPage() {
  const { profile } = useAuth();
  const uid = useId();
  const fileInputId = `${uid}-newsletter-image`;

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<NewsletterPurpose>("parent_monthly");
  const [keywords, setKeywords] = useState("");
  const [titleOverride, setTitleOverride] = useState("");
  const [published, setPublished] = useState<NewsletterAiResult | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [finalizedForPdf, setFinalizedForPdf] = useState(false);
  const [modelLabel, setModelLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const teacherName =
    profile?.displayName?.trim() ||
    profile?.email?.split("@")[0]?.trim() ||
    "Xtudy 마스터";

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const onFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setError(null);
    if (!f || !f.type.startsWith("image/")) {
      setImageFile(null);
      if (f) setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    setImageFile(f);
  }, []);

  const runGenerate = useCallback(async () => {
    if (!imageFile) {
      setError("분석할 이미지를 업로드해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data, model } = await requestNewsletterFromImage({
        imageFile,
        purpose,
        keywords,
        newsletterTitle: titleOverride || undefined,
      });
      setPublished(data);
      setFinalizedForPdf(false);
      setModelLabel(model);
    } catch (err: unknown) {
      setPublished(null);
      setFinalizedForPdf(false);
      setModelLabel(null);
      setError(err instanceof Error ? err.message : "생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }, [imageFile, purpose, keywords, titleOverride]);

  const runPdf = useCallback(async () => {
    if (!published || !finalizedForPdf) return;
    setPdfBusy(true);
    setError(null);
    try {
      await downloadNewsletterPdf({
        title: published.titleKo,
        teacherName,
        examDate: new Date().toISOString().slice(0, 10),
        newsletterSections: published.sections.map((s) => {
          const row: {
            heading: string;
            body: string;
            imageDataUrl?: string;
            imageWidthPercent?: number;
          } = {
            heading: s.headingKo,
            body: displayBody(s.bodyKo),
          };
          if (s.imageDataUrl) {
            row.imageDataUrl = s.imageDataUrl;
            row.imageWidthPercent = s.imageWidthPercent ?? 100;
          }
          return row;
        }),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "PDF 다운로드에 실패했습니다.");
    } finally {
      setPdfBusy(false);
    }
  }, [published, finalizedForPdf, teacherName]);

  return (
    <DashboardShell light>
      <div className={styles.root}>
        <Link to="/dashboard" className={styles.back}>
          ← 대시보드
        </Link>
        <header className={styles.head}>
          <h1>Newsletter Builder</h1>
          <p className={styles.headLead}>
            <span className="ui-en">
              Upload image → Vision AI summarizes passage & teacher notes → fixed template with Binary Logic (Signal
              Logic) as the main section → preview & PDF.
            </span>
            <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
              이미지 업로드 후 GPT-4o Vision이 지문·필기를 읽고,{" "}
              <strong>학습법 분석(Binary Logic / 시그널 로직)</strong>을 메인 섹션에 넣은 뉴스레터 초안을 만듭니다.
              오른쪽 미리보기와 동일한 화이트 톤으로 PDF를 내려받을 수 있습니다.
            </span>
          </p>
        </header>

        <div className={styles.grid}>
          <section className={styles.panel} aria-label="입력">
            <h2 className={styles.panelTitle}>Editor</h2>

            <div className={styles.field}>
              <label htmlFor={fileInputId}>이미지 업로드 (지문·필기 포함)</label>
              <input id={fileInputId} type="file" accept="image/*" onChange={onFile} />
              {previewUrl ? (
                <div className={styles.thumb}>
                  <img src={previewUrl} alt="업로드 미리보기" />
                </div>
              ) : null}
            </div>

            <div className={styles.field}>
              <label htmlFor={`${uid}-purpose`}>뉴스레터 목적</label>
              <select
                id={`${uid}-purpose`}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as NewsletterPurpose)}
              >
                {PURPOSES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.labelKo}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor={`${uid}-kw`}>키워드 (쉼표로 구분)</label>
              <textarea
                id={`${uid}-kw`}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="예: 수능 영어, 직독직해, 시그널, 오답 노트"
              />
            </div>

            <div className={styles.field}>
              <label htmlFor={`${uid}-title`}>뉴스레터 제목 힌트 (선택)</label>
              <input
                id={`${uid}-title`}
                type="text"
                value={titleOverride}
                onChange={(e) => setTitleOverride(e.target.value)}
                placeholder="비우면 AI가 제목을 제안합니다"
              />
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.btnPrimary} disabled={busy || !imageFile} onClick={runGenerate}>
                {busy ? "생성 중…" : "뉴스레터 생성"}
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={pdfBusy || !published || !finalizedForPdf}
                onClick={runPdf}
                title={!published ? undefined : !finalizedForPdf ? "미리보기에서 「수정」 후 「수정완료」를 누른 뒤 사용할 수 있습니다." : undefined}
              >
                {pdfBusy ? "PDF 준비 중…" : "PDF 다운로드"}
              </button>
            </div>
            {published && !finalizedForPdf ? (
              <p className={styles.pdfHint}>
                내용 확인·편집 후 미리보기 아래 「수정」을 열고, 끝나면 「수정완료」로 확정하면 PDF를 받을 수 있습니다.
              </p>
            ) : null}

            {modelLabel ? <p className={styles.meta}>모델: {modelLabel}</p> : null}
            {error ? (
              <div className={styles.error} role="alert">
                {error}
              </div>
            ) : null}
          </section>

          <section className={styles.panel} aria-label="미리보기">
            <h2 className={styles.panelTitle}>Preview</h2>
            <div className={styles.preview}>
              {!published ? (
                <p className={styles.previewEmpty}>
                  이미지와 옵션을 채운 뒤 「뉴스레터 생성」을 누르면 이 영역에 결과가 표시됩니다. 메인 섹션은 항상{" "}
                  <strong>Binary Logic · 시그널 로직</strong> 기반 학습법 분석입니다.
                </p>
              ) : (
                <>
                  <h3 className={styles.previewTitle}>{published.titleKo}</h3>
                  {published.sections.map((s) => (
                    <article key={s.id} className={styles.section}>
                      <div className={styles.sectionHead}>
                        <h2>{s.headingKo}</h2>
                        {s.id === "binaryLogic" ? (
                          <span className={styles.mainBadge}>Main · Binary Logic</span>
                        ) : null}
                      </div>
                      {s.imageDataUrl ? (
                        <div className={styles.previewImageWrap}>
                          <img
                            src={s.imageDataUrl}
                            alt=""
                            className={styles.previewImage}
                            style={{ width: `${s.imageWidthPercent ?? 100}%` }}
                          />
                        </div>
                      ) : null}
                      <p className={styles.body}>{displayBody(s.bodyKo)}</p>
                    </article>
                  ))}
                </>
              )}
            </div>
            {published ? (
              <div className={styles.previewActions}>
                <button type="button" className={styles.btnSilver} onClick={() => setEditOpen(true)}>
                  수정
                </button>
                {finalizedForPdf ? <span className={styles.finalizedTag}>수정 확정됨 — PDF 다운로드 가능</span> : null}
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {published ? (
        <NewsletterEditModal
          open={editOpen}
          initial={published}
          onCancel={() => setEditOpen(false)}
          onComplete={(next) => {
            setPublished(next);
            setFinalizedForPdf(true);
            setEditOpen(false);
          }}
        />
      ) : null}
    </DashboardShell>
  );
}
