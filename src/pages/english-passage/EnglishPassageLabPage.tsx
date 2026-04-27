import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { gradeShortAnswer } from "@/lib/exam/gradeShortAnswer";
import { analyzeEnglishPassage } from "@/lib/englishPassageLab/analyzeEnglishPassage";
import { downloadEnglishPassagePdf } from "@/lib/englishPassage/englishPassagePdfClient";
import type { EnglishPassageAnalysis, EnglishVocabPair } from "@/types/englishPassageLab";
import { EnglishVocabReviewModal } from "@/pages/english-passage/EnglishVocabReviewModal";
import styles from "@/pages/english-passage/englishPassageLab.module.css";

function gradeBlankLine(user: string, answers: string[]): boolean {
  const parts = user
    .split(/[,，、/|]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  if (answers.length === 0) return user.trim().length === 0;
  if (parts.length !== answers.length) return false;
  return answers.every((a, i) => gradeShortAnswer(parts[i] ?? "", a));
}

export function EnglishPassageLabPage() {
  const { firebaseUser, profile } = useAuth();
  const { showToast } = useToast();
  const teacherName = profile?.displayName?.trim() || firebaseUser?.email?.trim() || "선생님";

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

  const [wordMode, setWordMode] = useState<"en2ko" | "ko2en">("en2ko");
  const [wordAnswers, setWordAnswers] = useState<Record<string, string>>({});
  const [blankAnswers, setBlankAnswers] = useState<Record<string, string>>({});
  const [compAnswers, setCompAnswers] = useState<Record<string, string>>({});

  const [wordChecked, setWordChecked] = useState(false);
  const [blankChecked, setBlankChecked] = useState(false);
  const [compChecked, setCompChecked] = useState(false);

  const [pdfLayout, setPdfLayout] = useState<"1col" | "2col">("1col");
  const [pdfBusy, setPdfBusy] = useState(false);

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
      setWordAnswers({});
      setBlankAnswers({});
      setCompAnswers({});
      setWordChecked(false);
      setBlankChecked(false);
      setCompChecked(false);
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
      showToast("ok", "리스트가 저장되었습니다.");
      setWordAnswers({});
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

  const wordResults = useMemo(() => {
    if (!wordChecked || !vocabularyForUse.length) return null;
    return vocabularyForUse.map((v) => {
      const u = (wordAnswers[v.id] ?? "").trim();
      const ok =
        wordMode === "en2ko"
          ? gradeShortAnswer(u, v.meaning)
          : gradeShortAnswer(u, v.word);
      return { v, ok };
    });
  }, [wordChecked, vocabularyForUse, wordAnswers, wordMode]);

  const blankResults = useMemo(() => {
    if (!blankChecked || !analysis?.sentences.length) return null;
    return analysis.sentences.map((s) => ({
      s,
      ok: gradeBlankLine(blankAnswers[s.id] ?? "", s.blankAnswersKo),
    }));
  }, [analysis?.sentences, blankAnswers, blankChecked]);

  const compResults = useMemo(() => {
    if (!compChecked || !analysis?.sentences.length) return null;
    return analysis.sentences.map((s) => ({
      s,
      ok: gradeShortAnswer(compAnswers[s.id] ?? "", s.compositionEnglish),
    }));
  }, [analysis?.sentences, compAnswers, compChecked]);

  const downloadPdf = useCallback(async () => {
    if (!vocabConfirmed || !analysis) {
      showToast("warn", "단어 목록을 최종 확정한 뒤 이용할 수 있습니다.");
      return;
    }
    if (!vocabularyForUse.length && !analysis.sentences.length) {
      showToast("warn", "저장할 내용이 없습니다.");
      return;
    }
    setPdfBusy(true);
    try {
      await downloadEnglishPassagePdf({
        title: title.trim() || "영어 지문 학습",
        teacherName,
        passage: passageText.trim(),
        layout: pdfLayout,
        examDate: examDate.trim(),
        vocabulary: vocabularyForUse.map((v) => ({ word: v.word, meaning: v.meaning })),
        sentences: analysis.sentences.map((s) => ({
          english: s.english,
          koreanWithBlanks: s.koreanWithBlanks,
          compositionKorean: s.compositionKorean,
          compositionEnglish: s.compositionEnglish,
          blankAnswersKo: s.blankAnswersKo,
        })),
      });
      showToast("ok", "PDF를 내려받았습니다.");
    } catch (e) {
      showToast("err", e instanceof Error ? e.message : "PDF 생성 실패");
    } finally {
      setPdfBusy(false);
    }
  }, [
    vocabConfirmed,
    analysis,
    vocabularyForUse,
    passageText,
    title,
    teacherName,
    pdfLayout,
    examDate,
    showToast,
  ]);

  return (
    <DashboardShell light>
      <div className={styles.wrap}>
        <h1 className={styles.heroTitle}>영어 지문 자동 변환 학습</h1>
        <p className={styles.heroLead}>
          지문을 분석해 핵심 어휘와 문장별 직독직해·영작 연습을 구성합니다. 단어 목록을 검토한 뒤{" "}
          <strong>최종 확정</strong>해야 연습과 PDF가 활성화됩니다.
        </p>

        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleDot} aria-hidden />
            지문 입력
          </h2>
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
              disabled={analyzing || passageText.trim().length < 40}
              onClick={() => void runAnalyze()}
            >
              지문 분석
            </button>
            {analysis && (
              <button type="button" className={styles.btnGhost} onClick={openVocabEditor}>
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
            단어 목록을 확정하면 어휘 테스트·직독직해·영작 연습 및 PDF 다운로드가 열립니다.
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
            인터랙티브 · 어휘 테스트
          </h2>
          {!vocabConfirmed ? (
            <p className={styles.lockHint}>먼저 단어 목록을 확정해 주세요.</p>
          ) : (
            <>
              <div className={styles.actions} style={{ marginBottom: "0.75rem" }}>
                <button
                  type="button"
                  className={`${styles.btnSeg} ${wordMode === "en2ko" ? styles.btnSegActive : ""}`}
                  onClick={() => {
                    setWordMode("en2ko");
                    setWordChecked(false);
                  }}
                >
                  영어 → 한글
                </button>
                <button
                  type="button"
                  className={`${styles.btnSeg} ${wordMode === "ko2en" ? styles.btnSegActive : ""}`}
                  onClick={() => {
                    setWordMode("ko2en");
                    setWordChecked(false);
                  }}
                >
                  한글 → 영어
                </button>
              </div>
              <div>
                {vocabularyForUse.map((v) => (
                  <div key={v.id} className={styles.qBlock}>
                    <p className={styles.qLabel}>
                      {wordMode === "en2ko" ? (
                        <>
                          단어: <strong>{v.word}</strong>
                        </>
                      ) : (
                        <>
                          뜻: <strong>{v.meaning}</strong>
                        </>
                      )}
                    </p>
                    <input
                      className={styles.input48}
                      placeholder={wordMode === "en2ko" ? "한국어 뜻" : "영어 단어"}
                      value={wordAnswers[v.id] ?? ""}
                      onChange={(e) =>
                        setWordAnswers((m) => ({ ...m, [v.id]: e.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={!vocabularyForUse.length}
                  onClick={() => setWordChecked(true)}
                >
                  채점
                </button>
              </div>
              {wordResults && (
                <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.1rem", color: "#475569" }}>
                  {wordResults.map(({ v, ok }) => (
                    <li key={v.id}>
                      <strong>{v.word}</strong> — {ok ? "○" : "×"}{" "}
                      {!ok && <> (정답: {wordMode === "en2ko" ? v.meaning : v.word})</>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleDot} aria-hidden />
            인터랙티브 · 직독직해 (한국어 빈칸)
          </h2>
          {!vocabConfirmed || !analysis ? (
            <p className={styles.lockHint}>단어 확정 후 이용할 수 있습니다.</p>
          ) : (
            <>
              {analysis.sentences.map((s) => (
                <div key={s.id} className={styles.qBlock}>
                  <p className={styles.qLabel}>{s.koreanWithBlanks}</p>
                  <p className={styles.passageBox} style={{ fontSize: "0.85rem" }}>
                    원문: {s.english}
                  </p>
                  <label className={styles.label}>
                    빈칸 정답을 순서대로 (쉼표로 구분)
                    <input
                      className={styles.input48}
                      placeholder="예: 어구1, 어구2"
                      value={blankAnswers[s.id] ?? ""}
                      onChange={(e) =>
                        setBlankAnswers((m) => ({ ...m, [s.id]: e.target.value }))
                      }
                    />
                  </label>
                </div>
              ))}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setBlankChecked(true)}
                >
                  채점
                </button>
              </div>
              {blankResults && (
                <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.1rem", color: "#475569" }}>
                  {blankResults.map(({ s, ok }, i) => (
                    <li key={s.id}>
                      문장 {i + 1}: {ok ? "○" : "×"} (정답: {s.blankAnswersKo.join(", ")})
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleDot} aria-hidden />
            인터랙티브 · 영작
          </h2>
          {!vocabConfirmed || !analysis ? (
            <p className={styles.lockHint}>단어 확정 후 이용할 수 있습니다.</p>
          ) : (
            <>
              {analysis.sentences.map((s) => (
                <div key={s.id} className={styles.qBlock}>
                  <p className={styles.qLabel}>{s.compositionKorean}</p>
                  <textarea
                    className={styles.textareaPassage}
                    style={{ minHeight: "96px" }}
                    placeholder="영어로 작성하세요."
                    value={compAnswers[s.id] ?? ""}
                    onChange={(e) =>
                      setCompAnswers((m) => ({ ...m, [s.id]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() => setCompChecked(true)}
                >
                  채점
                </button>
              </div>
              {compResults && (
                <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.1rem", color: "#475569" }}>
                  {compResults.map(({ s, ok }, i) => (
                    <li key={s.id}>
                      문장 {i + 1}: {ok ? "○" : "×"}
                      {!ok && (
                        <>
                          {" "}
                          참고 영문: <em>{s.compositionEnglish}</em>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className={styles.sectionCard}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.sectionTitleDot} aria-hidden />
            PDF 출력
          </h2>
          <div className={styles.pdfRow132}>
            <label className={styles.label}>
              레이아웃
              <select
                className={styles.select48}
                value={pdfLayout}
                onChange={(e) => setPdfLayout(e.target.value === "2col" ? "2col" : "1col")}
              >
                <option value="1col">1단</option>
                <option value="2col">2단 (작성란 분할)</option>
              </select>
            </label>
            <div />
            <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={pdfBusy || !vocabConfirmed || !analysis}
                onClick={() => void downloadPdf()}
              >
                {pdfBusy ? "PDF 생성 중…" : "PDF 다운로드"}
              </button>
            </div>
          </div>
        </section>
      </div>

      {analyzing && (
        <div className={styles.overlay} role="alertdialog" aria-busy aria-live="polite">
          <div className={styles.spinner} />
          <p className={styles.overlayText}>지문 분석 중...</p>
        </div>
      )}
    </DashboardShell>
  );
}
