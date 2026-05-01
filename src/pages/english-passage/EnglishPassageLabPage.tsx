import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { gradeShortAnswer } from "@/lib/exam/gradeShortAnswer";
import { parseCommaSeparatedPdfPages } from "@/lib/pdf/parseCommaSeparatedPdfPages";
import {
  extractWorksheetPassageFromUpload,
  isWorksheetPdfUpload,
  type WorksheetExtractOptions,
} from "@/lib/worksheet/extractWorksheetPassageFromUpload";
import { analyzeEnglishPassage } from "@/lib/englishPassageLab/analyzeEnglishPassage";
import { gradeKoreanTranslation } from "@/lib/englishPassageLab/gradeKoreanTranslation";
import { openEnglishWorksheetPrint } from "@/lib/englishPassage/openEnglishWorksheetPrint";
import { downloadEnglishPassageLabDocx } from "@/lib/englishPassageLab/downloadEnglishPassageLabDocx";
import type { EnglishPassageAnalysis, EnglishVocabPair } from "@/types/englishPassageLab";
import { EnglishVocabReviewModal } from "@/pages/english-passage/EnglishVocabReviewModal";
import styles from "@/pages/english-passage/englishPassageLab.module.css";

export function EnglishPassageLabPage() {
  const { firebaseUser, profile } = useAuth();
  const { showToast } = useToast();
  const teacherName = profile?.displayName?.trim() || firebaseUser?.email?.trim() || "선생님";
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [passageText, setPassageText] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysis, setAnalysis] = useState<EnglishPassageAnalysis | null>(null);
  const [finalVocabulary, setFinalVocabulary] = useState<EnglishVocabPair[] | null>(null);
  const [vocabConfirmed, setVocabConfirmed] = useState(false);

  const [vocabModalOpen, setVocabModalOpen] = useState(false);
  const [pendingModalVocab, setPendingModalVocab] = useState<EnglishVocabPair[]>([]);

  const [wordAnswersEnKo, setWordAnswersEnKo] = useState<Record<string, string>>({});
  const [wordAnswersKoEn, setWordAnswersKoEn] = useState<Record<string, string>>({});
  const [translationAnswers, setTranslationAnswers] = useState<Record<string, string>>({});
  const [compAnswers, setCompAnswers] = useState<Record<string, string>>({});

  const [wordChecked, setWordChecked] = useState(false);
  const [translationChecked, setTranslationChecked] = useState(false);
  const [compChecked, setCompChecked] = useState(false);

  const [pdfLayout, setPdfLayout] = useState<"1col" | "2col">("1col");
  const [previewReady, setPreviewReady] = useState(false);
  const [wordBusy, setWordBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadAnalysisMode, setUploadAnalysisMode] = useState<"full" | "range" | "pick">("full");
  const [pdfPageFromInput, setPdfPageFromInput] = useState("1");
  const [pdfPageToInput, setPdfPageToInput] = useState("");
  const [pdfPageListInput, setPdfPageListInput] = useState("");

  const vocabularyForUse = finalVocabulary ?? [];

  const runAnalyze = useCallback(async () => {
    setError(null);
    setAnalyzing(true);
    try {
      const next = await analyzeEnglishPassage(passageText);
      setAnalysis(next);
      setFinalVocabulary(null);
      setVocabConfirmed(false);
      setPendingModalVocab(next.vocabulary);
      setVocabModalOpen(true);
      setWordAnswersEnKo({});
      setWordAnswersKoEn({});
      setTranslationAnswers({});
      setCompAnswers({});
      setWordChecked(false);
      setTranslationChecked(false);
      setCompChecked(false);
      setPreviewReady(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "분석에 실패했습니다.";
      setError(msg);
      showToast("err", msg);
    } finally {
      setAnalyzing(false);
    }
  }, [passageText, showToast]);

  const handleVocabFinalize = useCallback(
    (items: EnglishVocabPair[]) => {
      setFinalVocabulary(items);
      setVocabModalOpen(false);
      setVocabConfirmed(true);
      setPreviewReady(false);
      showToast("ok", "리스트가 저장되었습니다.");
      setWordAnswersEnKo({});
      setWordAnswersKoEn({});
      setWordChecked(false);
    },
    [showToast],
  );

  const openVocabEditor = useCallback(() => {
    const seed =
      finalVocabulary && finalVocabulary.length > 0
        ? finalVocabulary
        : analysis?.vocabulary ?? [];
    setPendingModalVocab(seed);
    setVocabModalOpen(true);
  }, [analysis?.vocabulary, finalVocabulary]);

  const wordResultsEnKo = useMemo(() => {
    if (!wordChecked || !vocabularyForUse.length) return null;
    return vocabularyForUse.map((v, i) => {
      const u = (wordAnswersEnKo[v.id] ?? "").trim();
      const ok = gradeShortAnswer(u, v.meaning);
      return { n: i + 1, v, ok };
    });
  }, [wordChecked, vocabularyForUse, wordAnswersEnKo]);

  const wordResultsKoEn = useMemo(() => {
    if (!wordChecked || !vocabularyForUse.length) return null;
    return vocabularyForUse.map((v, i) => {
      const u = (wordAnswersKoEn[v.id] ?? "").trim();
      const ok = gradeShortAnswer(u, v.word);
      return { n: i + 1, v, ok };
    });
  }, [wordChecked, vocabularyForUse, wordAnswersKoEn]);

  const translationResults = useMemo(() => {
    if (!translationChecked || !analysis?.sentences.length) return null;
    return analysis.sentences.map((s, i) => ({
      n: i + 1,
      s,
      ok: gradeKoreanTranslation(translationAnswers[s.id] ?? "", s.koreanFull),
    }));
  }, [analysis?.sentences, translationAnswers, translationChecked]);

  const compResults = useMemo(() => {
    if (!compChecked || !analysis?.sentences.length) return null;
    return analysis.sentences.map((s, i) => ({
      n: i + 1,
      s,
      ok: gradeShortAnswer(compAnswers[s.id] ?? "", s.english),
    }));
  }, [analysis?.sentences, compAnswers, compChecked]);

  const buildPreview = useCallback(() => {
    if (!vocabConfirmed || !analysis) {
      showToast("warn", "단어 목록을 최종 확정한 뒤 이용할 수 있습니다.");
      return;
    }
    setPreviewReady(true);
    showToast("ok", "문제지 미리보기가 아래에 표시됩니다. 「인쇄 / PDF 저장」으로 출력하세요.");
  }, [analysis, showToast, vocabConfirmed]);

  const handlePrint = useCallback(() => {
    if (!vocabConfirmed || !analysis) return;
    try {
      openEnglishWorksheetPrint({
        title: title.trim() || "영어 지문 학습",
        teacherName,
        examDate: examDate.trim(),
        passage: passageText.trim(),
        layout: pdfLayout,
        layoutNote: pdfLayout === "2col" ? "2단 (원문·타이틀 1열, 문제·정답 2열)" : "1단",
        vocabulary: vocabularyForUse.map((v) => ({ word: v.word, meaning: v.meaning })),
        sentences: analysis.sentences.map((s) => ({
          english: s.english,
          koreanFull: s.koreanFull,
        })),
      });
      showToast("ok", "잠시 후 인쇄 창이 열립니다. 「PDF로 저장」을 선택하세요.");
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "인쇄를 열 수 없습니다.");
    }
  }, [
    analysis,
    examDate,
    passageText,
    pdfLayout,
    showToast,
    teacherName,
    title,
    vocabConfirmed,
    vocabularyForUse,
  ]);

  const handleExportWord = useCallback(async () => {
    if (!vocabConfirmed || !analysis) return;
    const layoutLabel =
      pdfLayout === "2col" ? "2단 (원문·타이틀 1열, 문제·정답 2열)" : "1단";
    setWordBusy(true);
    try {
      await downloadEnglishPassageLabDocx({
        title: title.trim() || "영어 지문 학습",
        teacherName,
        examDate: examDate.trim(),
        layoutLabel,
        passage: passageText.trim(),
        vocabulary: vocabularyForUse,
        analysis,
      });
      showToast("ok", "Word(.docx) 파일이 저장되었습니다. Google 문서에서 열어 수정할 수 있습니다.");
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "Word 파일을 만들지 못했습니다.");
    } finally {
      setWordBusy(false);
    }
  }, [
    analysis,
    examDate,
    passageText,
    pdfLayout,
    showToast,
    teacherName,
    title,
    vocabConfirmed,
    vocabularyForUse,
  ]);

  const processUploadedFile = useCallback(
    async (file: File) => {
      setError(null);
      setUploadBusy(true);
      let extractOpts: WorksheetExtractOptions | undefined;
      if (isWorksheetPdfUpload(file)) {
        if (uploadAnalysisMode === "range") {
          const fromPage = Math.max(1, parseInt(pdfPageFromInput.trim(), 10) || 1);
          const toTrim = pdfPageToInput.trim();
          if (toTrim !== "") {
            const toNum = parseInt(toTrim, 10);
            if (!Number.isFinite(toNum) || toNum < fromPage) {
              const msg = "PDF 끝 페이지는 시작 페이지 이상의 숫자로 입력하거나 비워 두세요.";
              setError(msg);
              showToast("err", msg);
              setUploadBusy(false);
              return;
            }
            extractOpts = { pdfPageFrom: fromPage, pdfPageTo: toNum };
          } else {
            extractOpts = { pdfPageFrom: fromPage };
          }
        } else if (uploadAnalysisMode === "pick") {
          const parsed = parseCommaSeparatedPdfPages(pdfPageListInput);
          if (parsed === "invalid") {
            const msg = "PDF 페이지는 1 이상의 정수를 쉼표로 구분해 입력하세요. 예: 4, 5, 9";
            setError(msg);
            showToast("err", msg);
            setUploadBusy(false);
            return;
          }
          if (parsed === "empty") {
            const msg = "추출할 페이지 번호를 입력하세요. 예: 4, 5, 9";
            setError(msg);
            showToast("err", msg);
            setUploadBusy(false);
            return;
          }
          extractOpts = { pdfPageList: parsed };
        }
      }

      const nonPdfPagesNote = uploadAnalysisMode !== "full" && !isWorksheetPdfUpload(file);

      try {
        const extracted = (await extractWorksheetPassageFromUpload(file, extractOpts)).trim();
        if (!extracted) {
          const msg = "파일에서 추출한 본문이 비어 있습니다.";
          setError(msg);
          showToast("err", msg);
          return;
        }
        setPassageText((prev) => {
          const t = prev.trim();
          return t ? `${t}\n\n---\n\n${extracted}` : extracted;
        });
        showToast(
          "ok",
          nonPdfPagesNote
            ? `「${file.name}」전체 본문을 가져왔습니다. (페이지 지정은 PDF만 적용)`
            : `「${file.name}」에서 지문을 채웠습니다.`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "파일 처리에 실패했습니다.";
        setError(msg);
        showToast("err", msg);
      } finally {
        setUploadBusy(false);
      }
    },
    [
      pdfPageFromInput,
      pdfPageListInput,
      pdfPageToInput,
      showToast,
      uploadAnalysisMode,
    ],
  );

  const onPickFiles = useCallback(
    (list: FileList | null) => {
      const file = list?.[0];
      if (!file) return;
      void processUploadedFile(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [processUploadedFile],
  );

  const anyBusy = analyzing || uploadBusy || wordBusy;

  const startNewPassageLab = useCallback(() => {
    if (anyBusy) return;
    if (!window.confirm("입력·분석·연습 내용이 모두 초기화됩니다. 새로 작성할까요?")) return;
    setTitle("");
    setExamDate(new Date().toISOString().slice(0, 10));
    setPassageText("");
    setAnalysis(null);
    setFinalVocabulary(null);
    setVocabConfirmed(false);
    setVocabModalOpen(false);
    setPendingModalVocab([]);
    setWordAnswersEnKo({});
    setWordAnswersKoEn({});
    setTranslationAnswers({});
    setCompAnswers({});
    setWordChecked(false);
    setTranslationChecked(false);
    setCompChecked(false);
    setPdfLayout("1col");
    setPreviewReady(false);
    setError(null);
    setUploadAnalysisMode("full");
    setPdfPageFromInput("1");
    setPdfPageToInput("");
    setPdfPageListInput("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [anyBusy]);

  return (
    <DashboardShell light>
      <div className={styles.wrap}>
        <h1 className={styles.heroTitle}>영어 지문 자동 변환 학습</h1>
        <p className={styles.heroLead}>
          단어 확정 후 문항 번호가 붙은 어휘·직독직해·영작을 풀고,{" "}
          <strong>정답은 하단 정답 섹션</strong>에서 확인합니다. 인쇄(PDF)는{" "}
          <strong>미리보기로 확인한 뒤</strong> 진행하고, <strong>Word(.docx)</strong>는 레이아웃만
          선택하면 바로 저장해 Google 문서에서 편집할 수 있습니다.
        </p>

        <section className={styles.sectionCard}>
          <div className={styles.sectionHeadRow}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionTitleDot} aria-hidden />
              지문 입력
            </h2>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={anyBusy}
              onClick={() => startNewPassageLab()}
            >
              새로 작성
            </button>
          </div>
          <div className={styles.grid132}>
            <label className={styles.label}>
              학습 제목
              <input
                className={styles.input48}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: Unit 3 Reading"
              />
            </label>
            <label className={styles.label}>
              시행일
              <input
                className={styles.input48}
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </label>
            <label className={styles.label}>
              담당 (자동)
              <input className={styles.input48} readOnly value={teacherName} />
            </label>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className={styles.fileInputHidden}
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => onPickFiles(e.target.files)}
          />
          <div
            className={`${styles.uploadDrop}${dragOver ? ` ${styles.uploadDropActive}` : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              onPickFiles(e.dataTransfer.files);
            }}
          >
            <p className={styles.uploadDropTitle}>
              <strong>PDF · Word(DOCX) · 이미지</strong>를 드래그하거나 파일 선택
            </p>
            <p className={styles.uploadDropSub}>
              텍스트를 추출해 아래 영어 지문에 반영합니다. 이미지는 AI Vision으로 읽습니다(
              <code className={styles.uploadCode}>VITE_OPENAI_API_KEY</code> 필요).
            </p>
            <button
              type="button"
              className={styles.btnGhost}
              disabled={anyBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadBusy ? "추출 중…" : "파일 선택"}
            </button>
          </div>
          <div className={styles.uploadScope}>
            <span className={styles.uploadScopeLabel}>분석 범위</span>
            <div className={styles.segmentRow} role="radiogroup" aria-label="업로드 분석 범위">
              <label className={styles.segmentItem}>
                <input
                  type="radio"
                  name="epl-upload-scope"
                  checked={uploadAnalysisMode === "full"}
                  onChange={() => setUploadAnalysisMode("full")}
                  disabled={anyBusy}
                />
                <span>전체 분석</span>
              </label>
              <label className={styles.segmentItem}>
                <input
                  type="radio"
                  name="epl-upload-scope"
                  checked={uploadAnalysisMode === "range"}
                  onChange={() => setUploadAnalysisMode("range")}
                  disabled={anyBusy}
                />
                <span>
                  페이지 구간 <span className={styles.segmentNote}>(PDF)</span>
                </span>
              </label>
              <label className={styles.segmentItem}>
                <input
                  type="radio"
                  name="epl-upload-scope"
                  checked={uploadAnalysisMode === "pick"}
                  onChange={() => setUploadAnalysisMode("pick")}
                  disabled={anyBusy}
                />
                <span>
                  특정 페이지 <span className={styles.segmentNote}>(PDF)</span>
                </span>
              </label>
            </div>
            {uploadAnalysisMode === "range" ? (
              <div className={styles.pageRangeGrid}>
                <label className={styles.pageField}>
                  <span className={styles.pageFieldLabel}>시작 페이지</span>
                  <input
                    className={styles.input48}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={pdfPageFromInput}
                    onChange={(e) => setPdfPageFromInput(e.target.value)}
                    disabled={anyBusy}
                    aria-label="PDF 시작 페이지"
                  />
                </label>
                <label className={styles.pageField}>
                  <span className={styles.pageFieldLabel}>끝 페이지</span>
                  <input
                    className={styles.input48}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={pdfPageToInput}
                    onChange={(e) => setPdfPageToInput(e.target.value)}
                    disabled={anyBusy}
                    placeholder="비우면 마지막까지"
                    aria-label="PDF 끝 페이지"
                  />
                </label>
                <p className={styles.scopeHint}>
                  연속 구간만 추출합니다. Word·이미지는 전체 본문만 반영됩니다.
                </p>
              </div>
            ) : null}
            {uploadAnalysisMode === "pick" ? (
              <div className={styles.pageRangeGrid}>
                <label className={styles.pageFieldWide}>
                  <span className={styles.pageFieldLabel}>페이지 번호</span>
                  <input
                    className={styles.input48}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pdfPageListInput}
                    onChange={(e) => setPdfPageListInput(e.target.value)}
                    disabled={anyBusy}
                    placeholder="예: 4, 5, 9"
                    aria-label="PDF 특정 페이지, 쉼표로 구분"
                  />
                </label>
                <p className={styles.scopeHint}>
                  쉼표로 구분해 여러 페이지만 순서대로 가져옵니다. Word·이미지는 전체입니다.
                </p>
              </div>
            ) : null}
          </div>
          <label className={styles.label} style={{ marginTop: "0.75rem" }}>
            영어 지문
            <textarea
              className={styles.textareaPassage}
              value={passageText}
              onChange={(e) => setPassageText(e.target.value)}
              placeholder="영어 지문 전체를 붙여 넣어 주세요."
            />
          </label>
          <div className={styles.actions} style={{ marginTop: "0.85rem" }}>
            <button
              type="button"
              className={styles.btnPrimary}
              disabled={anyBusy || passageText.trim().length < 40}
              onClick={() => void runAnalyze()}
            >
              지문 분석
            </button>
            {analysis && (
              <button
                type="button"
                className={styles.btnGhost}
                disabled={anyBusy}
                onClick={openVocabEditor}
              >
                단어 목록 검토·편집
              </button>
            )}
            <Link to="/dashboard" className={styles.btnGhost}>
              대시보드
            </Link>
          </div>
          {error && <p className={styles.err}>{error}</p>}
        </section>

        <EnglishVocabReviewModal
          open={vocabModalOpen}
          initialItems={pendingModalVocab}
          onClose={() => setVocabModalOpen(false)}
          onFinalize={handleVocabFinalize}
        />

        {!vocabConfirmed && (
          <p className={styles.lockHint}>
            단어 목록을 확정하면 연습·미리보기·인쇄가 사용할 수 있습니다.
          </p>
        )}

        {analysis && (
          <section className={styles.sectionCard}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.sectionTitleDot} aria-hidden />
              원문 미리보기
            </h2>
            <div className={styles.passageBox}>{passageText.trim()}</div>
          </section>
        )}

        <section className={styles.sectionCard} aria-disabled={!vocabConfirmed}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleDot} aria-hidden />
            인터랙티브 · 어휘 (영어 ↔ 한글 뜻)
          </h2>
          {!vocabConfirmed ? (
            <p className={styles.lockHint}>먼저 단어 목록을 확정해 주세요.</p>
          ) : (
            <>
              <h3 className={styles.subHeading}>A. 영어 단어 → 한글 뜻</h3>
              {vocabularyForUse.map((v, idx) => (
                <div key={`ek-${v.id}`} className={styles.qBlock}>
                  <p className={styles.qLabel}>
                    문항 {idx + 1}. <strong>{v.word}</strong>
                  </p>
                  <input
                    className={styles.input48}
                    placeholder="한국어 뜻을 입력하세요"
                    value={wordAnswersEnKo[v.id] ?? ""}
                    onChange={(e) =>
                      setWordAnswersEnKo((m) => ({ ...m, [v.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <h3 className={styles.subHeading}>B. 한글 뜻 → 영어 단어</h3>
              {vocabularyForUse.map((v, idx) => (
                <div key={`ke-${v.id}`} className={styles.qBlock}>
                  <p className={styles.qLabel}>
                    문항 {idx + 1}. <strong>{v.meaning}</strong>
                  </p>
                  <input
                    className={styles.input48}
                    placeholder="영어 단어를 입력하세요"
                    value={wordAnswersKoEn[v.id] ?? ""}
                    onChange={(e) =>
                      setWordAnswersKoEn((m) => ({ ...m, [v.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!vocabularyForUse.length}
                  onClick={() => setWordChecked(true)}
                >
                  어휘 채점
                </button>
              </div>
            </>
          )}
        </section>

        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleDot} aria-hidden />
            인터랙티브 · 직독직해 (영문 → 한국어 해석 전체)
          </h2>
          {!vocabConfirmed || !analysis ? (
            <p className={styles.lockHint}>단어 확정 후 이용할 수 있습니다.</p>
          ) : (
            <>
              {analysis.sentences.map((s, idx) => (
                <div key={s.id} className={styles.qBlock}>
                  <p className={styles.qLabel}>문항 {idx + 1}.</p>
                  <p className={styles.passageBox} style={{ fontSize: "0.9rem" }}>
                    {s.english}
                  </p>
                  <label className={styles.label}>
                    한국어 해석 (전체 문장)
                    <textarea
                      className={styles.textareaPassage}
                      style={{ minHeight: "120px" }}
                      placeholder="위 영문의 한국어 해석을 완전히 쓰세요."
                      value={translationAnswers[s.id] ?? ""}
                      onChange={(e) =>
                        setTranslationAnswers((m) => ({ ...m, [s.id]: e.target.value }))
                      }
                    />
                  </label>
                </div>
              ))}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setTranslationChecked(true)}
                >
                  직독직해 채점
                </button>
              </div>
            </>
          )}
        </section>

        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleDot} aria-hidden />
            인터랙티브 · 영작 (한국어 해석 → 영문 전체)
          </h2>
          {!vocabConfirmed || !analysis ? (
            <p className={styles.lockHint}>단어 확정 후 이용할 수 있습니다.</p>
          ) : (
            <>
              {analysis.sentences.map((s, idx) => (
                <div key={`w-${s.id}`} className={styles.qBlock}>
                  <p className={styles.qLabel}>문항 {idx + 1}.</p>
                  <p className={styles.passageBox} style={{ fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                    {s.koreanFull}
                  </p>
                  <label className={styles.label}>
                    영어 문장 (전체)
                    <textarea
                      className={styles.textareaPassage}
                      style={{ minHeight: "120px" }}
                      placeholder="위 한국어 뜻에 맞는 영문을 완전히 쓰세요."
                      value={compAnswers[s.id] ?? ""}
                      onChange={(e) =>
                        setCompAnswers((m) => ({ ...m, [s.id]: e.target.value }))
                      }
                    />
                  </label>
                </div>
              ))}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setCompChecked(true)}
                >
                  영작 채점
                </button>
              </div>
            </>
          )}
        </section>

        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleDot} aria-hidden />
            정답 · 채점 결과
          </h2>
          <p className={styles.hintMuted}>
            모범 정답과, 위에서 「채점」을 누른 항목의 결과만 표시됩니다.
          </p>

          {vocabConfirmed && vocabularyForUse.length > 0 && (
            <details className={styles.answerDetails} open>
              <summary>어휘 모범 정답</summary>
              <ol className={styles.answerOl}>
                {vocabularyForUse.map((v) => (
                  <li key={v.id}>
                    <strong>{v.word}</strong> — {v.meaning}
                  </li>
                ))}
              </ol>
              {wordChecked && wordResultsEnKo && (
                <p className={styles.answerSub}>A (영→한) 채점</p>
              )}
              {wordChecked &&
                wordResultsEnKo?.map(({ n, v, ok }) => (
                  <p key={`rea-${v.id}`} className={styles.answerLine}>
                    문항 {n}: {ok ? "○" : "×"} {!ok && `(정답 뜻: ${v.meaning})`}
                  </p>
                ))}
              {wordChecked && wordResultsKoEn && (
                <p className={styles.answerSub}>B (한→영) 채점</p>
              )}
              {wordChecked &&
                wordResultsKoEn?.map(({ n, v, ok }) => (
                  <p key={`reb-${v.id}`} className={styles.answerLine}>
                    문항 {n}: {ok ? "○" : "×"} {!ok && `(정답 단어: ${v.word})`}
                  </p>
                ))}
            </details>
          )}

          {vocabConfirmed && analysis && analysis.sentences.length > 0 && (
            <details className={styles.answerDetails} open>
              <summary>직독직해 모범 정답 (한국어 전체)</summary>
              <ol className={styles.answerOl}>
                {analysis.sentences.map((s, i) => (
                  <li key={s.id}>
                    문항 {i + 1}: {s.koreanFull}
                  </li>
                ))}
              </ol>
              {translationChecked &&
                translationResults?.map(({ n, s, ok }) => (
                  <p key={`tr-${s.id}`} className={styles.answerLine}>
                    문항 {n}: {ok ? "○" : "×"}
                  </p>
                ))}
            </details>
          )}

          {vocabConfirmed && analysis && analysis.sentences.length > 0 && (
            <details className={styles.answerDetails} open>
              <summary>영작 모범 정답 (영어 원문)</summary>
              <ol className={styles.answerOl}>
                {analysis.sentences.map((s, i) => (
                  <li key={`a-${s.id}`}>
                    문항 {i + 1}: {s.english}
                  </li>
                ))}
              </ol>
              {compChecked &&
                compResults?.map(({ n, s, ok }) => (
                  <p key={`cr-${s.id}`} className={styles.answerLine}>
                    문항 {n}: {ok ? "○" : "×"}
                  </p>
                ))}
            </details>
          )}
        </section>

        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleDot} aria-hidden />
            문제지 미리보기 · 인쇄
          </h2>
          <p className={styles.hintMuted}>
            ① 미리보기 생성 → ② 새 창 인쇄에서 「PDF로 저장」 선택, 또는 같은 화면에서 Word(.docx)로 내려받기
          </p>
          <div className={styles.pdfRow132}>
            <label className={styles.label}>
              레이아웃
              <select
                className={styles.select48}
                value={pdfLayout}
                onChange={(e) => setPdfLayout(e.target.value === "2col" ? "2col" : "1col")}
              >
                <option value="1col">1단</option>
                <option value="2col">2단 (원문 1열 · 문제·정답 2열)</option>
              </select>
            </label>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!vocabConfirmed || !analysis}
                onClick={buildPreview}
              >
                문제지 미리보기 생성
              </button>
            </div>
            <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={!vocabConfirmed || !analysis || wordBusy}
                onClick={handlePrint}
              >
                인쇄 / PDF 저장
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={!vocabConfirmed || !analysis || wordBusy}
                onClick={() => void handleExportWord()}
              >
                {wordBusy ? "Word 생성 중…" : "Word(.docx) 내보내기"}
              </button>
            </div>
          </div>

          {previewReady && analysis && (
            <div className={styles.previewSheet}>
              <div className={styles.previewSheetTop}>
                <p className={styles.previewBadge}>미리보기 (인쇄 레이아웃과 유사)</p>
                <p className={styles.previewBrand}>Xtudy-Universe · English Lab</p>
                <h3 className={styles.previewH3}>{title.trim() || "영어 지문 학습"}</h3>
                <p className={styles.previewMeta}>
                  {teacherName} · {examDate} · {pdfLayout === "2col" ? "2단" : "1단"}
                </p>
                <h4 className={styles.previewH4}>원문</h4>
                <div className={styles.previewPassage}>{passageText.trim()}</div>
              </div>
              {pdfLayout === "2col" ? <hr className={styles.previewMajorRule} /> : null}
              <div
                className={pdfLayout === "2col" ? styles.previewTwoCol : styles.previewOneColBody}
              >
                <h4 className={styles.previewH4}>A. 영어 → 한글</h4>
                <ol>
                  {vocabularyForUse.map((v) => (
                    <li key={v.id}>{v.word}</li>
                  ))}
                </ol>
                <h4 className={styles.previewH4}>B. 한글 → 영어</h4>
                <ol>
                  {vocabularyForUse.map((v) => (
                    <li key={`p-${v.id}`}>{v.meaning}</li>
                  ))}
                </ol>
                <h4 className={styles.previewH4}>C. 직독직해 (영문 → 한국어)</h4>
                {analysis.sentences.map((s, idx) => (
                  <div key={s.id} className={styles.previewBlock}>
                    <p className={styles.previewQn}>문항 {idx + 1}</p>
                    <p className={styles.previewEnLine}>{s.english}</p>
                    <div className={styles.previewSingleArea} aria-hidden />
                  </div>
                ))}
                <h4 className={styles.previewH4}>D. 영작 (한국어 → 영문)</h4>
                {analysis.sentences.map((s, idx) => (
                  <div key={`pk-${s.id}`} className={styles.previewBlock}>
                    <p className={styles.previewQn}>문항 {idx + 1}</p>
                    <p className={styles.previewKoLine}>{s.koreanFull}</p>
                    <div className={styles.previewSingleArea} aria-hidden />
                  </div>
                ))}
                <div className={styles.previewAnswerKey}>
                  <p className={styles.previewAnswerKeyTitle}>교사용 · 모범 정답</p>
                  <ol>
                    {vocabularyForUse.map((v) => (
                      <li key={`ans-v-${v.id}`}>
                        <strong>{v.word}</strong> — {v.meaning}
                      </li>
                    ))}
                  </ol>
                  {analysis.sentences.map((s, idx) => (
                    <div key={`ans-s-${s.id}`} className={styles.previewBlock}>
                      <p className={styles.previewQn}>직독 {idx + 1}</p>
                      <p className={styles.previewKoLine} style={{ borderLeftColor: "#0d9488" }}>
                        {s.koreanFull}
                      </p>
                      <p className={styles.previewQn}>영작 {idx + 1}</p>
                      <p className={styles.previewEnLine} style={{ borderLeftColor: "#0d9488" }}>
                        {s.english}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {analyzing || uploadBusy ? (
        <div className={styles.overlay} role="alertdialog" aria-busy aria-live="polite">
          <div className={styles.spinner} />
          <p className={styles.overlayText}>
            {analyzing ? "지문 분석 중..." : "자료에서 텍스트 추출 중..."}
          </p>
        </div>
      ) : null}
    </DashboardShell>
  );
}
