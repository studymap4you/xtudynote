import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
} from "firebase/firestore";
import { SIGNAL_LOGIC_SAMPLE_ANALYSES } from "@/data/signalLogicReadingSamples";
import { PassageDeepAnalysisModal } from "@/components/signalLogic/PassageDeepAnalysisModal";
import { SignalLogicAnalysisModal } from "@/components/signalLogic/SignalLogicAnalysisModal";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import { savedReportDocToPassageAnalysis } from "@/lib/signalLogic/savedReportToPassageCard";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import type { SignalLogicPassageAnalysis } from "@/types/signalLogicReading";
import styles from "@/pages/logicDashboard.module.css";

function clipText(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars).trim()}…`;
}

type PassageCardProps = {
  analysis: SignalLogicPassageAnalysis;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
};

function PassageCard({ analysis, selectable, selected, onToggleSelect }: PassageCardProps) {
  const { vocabulary, binaryLogic, signals, correctAnswer, originalText, analyzedAt, title } =
    analysis;
  const preview = clipText(originalText, 118);
  const binaryPreview = binaryLogic.slice(0, 4);
  const signalPreview = signals.slice(0, 2);

  return (
    <div
      className={`${styles.cardWrap} ${selectable ? styles.cardWrapSelectable : ""} ${selected ? styles.cardWrapSelected : ""}`}
    >
      {selectable ? (
        <label className={styles.cardCheck} htmlFor={`logic-card-${analysis.id}`}>
          <input
            id={`logic-card-${analysis.id}`}
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(analysis.id)}
            aria-label={`「${title}」분석 선택`}
          />
        </label>
      ) : null}
      <article className={styles.card} title={`해석 미리보기: ${clipText(analysis.translation, 160)}`}>
        <div className={styles.cardLabel}>Recent passage</div>
        <h3 className={styles.cardTitle}>{title}</h3>
        <p className={styles.cardMeta}>분석일 {analyzedAt}</p>
        <p className={styles.cardPreview}>{preview}</p>
        <div className={styles.cardFooter}>
          {correctAnswer != null ? (
            <span className={`${styles.chip} ${styles.chipBinary}`}>정답 {correctAnswer.option}번</span>
          ) : (
            <span className={`${styles.chip} ${styles.chipMuted}`}>AI 분석 리포트</span>
          )}
          <span className={`${styles.chip} ${styles.chipMuted}`}>어휘 {vocabulary.length}</span>
          {binaryPreview.map((b, i) => (
            <span key={`${analysis.id}-b-${i}`} className={styles.chip}>
              [{b.bucket}] {b.keyword}
            </span>
          ))}
          {signalPreview.map((s, i) => (
            <span key={`${analysis.id}-s-${i}`} className={`${styles.chip} ${styles.chipMuted}`}>
              {s.word}·{s.logicRole}
            </span>
          ))}
        </div>
      </article>
    </div>
  );
}

const RECENT_REPORTS_LIMIT = 12;

function mapSnapshotToAnalyses(snap: QuerySnapshot): SignalLogicPassageAnalysis[] {
  const out: SignalLogicPassageAnalysis[] = [];
  snap.forEach((d) => {
    const x = d.data();
    const passage = typeof x.passage === "string" ? x.passage : "";
    const analysis = x.analysis as SignalLogicAnalysisReportJson | undefined;
    if (!passage || !analysis || analysis.schemaVersion !== 1) return;
    try {
      out.push(savedReportDocToPassageAnalysis(d.id, passage, analysis, x.createdAt));
    } catch {
      /* malformed doc — skip */
    }
  });
  return out;
}

export function SignalLogicReadingDashboard() {
  const { firebaseUser, canManageMaterials } = useAuth();
  const uid = firebaseUser?.uid ?? "";
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [deepOpen, setDeepOpen] = useState(false);
  const [savedAnalyses, setSavedAnalyses] = useState<SignalLogicPassageAnalysis[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setSavedAnalyses([]);
      setSavedLoading(false);
      setSelectedIds(new Set());
      return;
    }
    setSavedLoading(true);
    const q = query(
      collection(db, "users", uid, "signal_logic_reports"),
      orderBy("createdAt", "desc"),
      limit(RECENT_REPORTS_LIMIT),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSavedAnalyses(mapSnapshotToAnalyses(snap));
        setSavedLoading(false);
      },
      () => {
        setSavedLoading(false);
      },
    );
    return () => unsub();
  }, [uid]);

  const cardItems = useMemo(() => {
    if (uid) {
      return savedAnalyses;
    }
    return SIGNAL_LOGIC_SAMPLE_ANALYSES;
  }, [uid, savedAnalyses]);

  const selectable = Boolean(uid);

  useEffect(() => {
    if (!uid) return;
    const valid = new Set(savedAnalyses.map((a) => a.id));
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => valid.has(id)));
      if (next.size !== prev.size) return next;
      for (const id of prev) {
        if (!next.has(id)) return next;
      }
      return prev;
    });
  }, [uid, savedAnalyses]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDeleteErr(null);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(cardItems.map((c) => c.id)));
    setDeleteErr(null);
  }, [cardItems]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setDeleteErr(null);
  }, []);

  const deleteSelected = useCallback(async () => {
    if (!uid || selectedIds.size === 0) return;
    setDeleteBusy(true);
    setDeleteErr(null);
    try {
      const ids = [...selectedIds];
      await Promise.all(ids.map((id) => deleteDoc(doc(db, "users", uid, "signal_logic_reports", id))));
      setSelectedIds(new Set());
    } catch (e) {
      setDeleteErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  }, [uid, selectedIds]);

  const selectedCount = selectedIds.size;

  return (
    <main className={styles.main}>
      <header className={styles.titleBlock}>
        <h1>
          Signal Logic <span className={styles.titleAccent}>Reading</span>
        </h1>
        <span className={styles.leadEn}>Unified logic-reading dashboard</span>
        <span className={styles.leadKo}>
          논리 독해 통합 대시보드 — 원문·해석·어휘·이분 논리·시그널·정답 데이터를 한 구조로 묶어
          관리합니다.
        </span>
      </header>

      {firebaseUser && canManageMaterials ? (
        <section className={styles.worksheetHub} aria-labelledby="logic-worksheet-hub-heading">
          <h2 id="logic-worksheet-hub-heading" className={styles.worksheetHubTitle}>
            Logic worksheets
            <span className={styles.sectionHeadingKo} style={{ marginTop: "0.15rem" }}>
              학습지 배포·현황 · 마스터·교육자 공통
            </span>
          </h2>
          <p className={styles.worksheetHubKo}>
            분석 리포트를 바탕으로 학습지 과제를 배포하고, 학생 제출·알림을 확인합니다. 상단「Signal Logic」메뉴로
            들어온 이 화면에서 바로 이용할 수 있습니다.
          </p>
          <div className={styles.worksheetHubActions}>
            <Link to="/teacher/assignments" className="btn btn--primary btn--stack">
              <span className="ui-en">Open worksheet hub</span>
              <span className="ui-ko">학습지 목록·현황</span>
            </Link>
            <Link to="/teacher/assignments/new" className="btn btn--ghost btn--stack">
              <span className="ui-en">New worksheet</span>
              <span className="ui-ko">새 학습지 배포</span>
            </Link>
          </div>
        </section>
      ) : null}

      {uid && canManageMaterials ? (
        <div className={styles.sectionRhythm} aria-hidden="true">
          <span className={styles.sectionRhythmLine} />
          <span className={styles.sectionRhythmBadge}>
            <span className={styles.sectionRhythmDot} aria-hidden />
            Saved analyses
          </span>
          <span className={styles.sectionRhythmLine} />
        </div>
      ) : uid ? (
        <div className={styles.sectionRhythm} aria-hidden="true">
          <span className={styles.sectionRhythmLine} />
          <span className={styles.sectionRhythmBadge}>
            <span className={styles.sectionRhythmDot} aria-hidden />
            My library
          </span>
          <span className={styles.sectionRhythmLine} />
        </div>
      ) : (
        <div style={{ height: "1.25rem" }} aria-hidden />
      )}

      <section className={styles.recentSection} aria-labelledby="logic-recent-heading">
        <h2 id="logic-recent-heading" className={styles.sectionHeading}>
          최근 분석 지문
          <span className={styles.sectionHeadingKo}>Recently analyzed passages</span>
        </h2>
        <p className={styles.recentSectionDesc}>
          {uid ? (
            <>
              <span className="ui-ko">로그인 계정에 저장된 분석이 최신순으로 표시됩니다.</span>
              {savedLoading ? (
                <span className="ui-ko" style={{ marginLeft: "0.5rem" }}>
                  불러오는 중…
                </span>
              ) : null}
              {selectable && cardItems.length > 0 ? (
                <>
                  {" "}
                  <span className="ui-ko" style={{ color: "#64748b" }}>
                    카드 오른쪽 체크 후「선택 삭제」로 기록을 지울 수 있습니다.
                  </span>
                </>
              ) : null}
            </>
          ) : (
            <span className="ui-ko">로그인하면 여기에 내 분석 기록이 쌓입니다. 아래는 예시 지문입니다.</span>
          )}
        </p>

        {selectable && cardItems.length > 0 ? (
          <>
            {deleteErr ? <p className={styles.deleteErr}>{deleteErr}</p> : null}
            <div className={styles.recentToolbar} role="toolbar" aria-label="분석 기록 선택">
              <div className={styles.recentToolbarLeft}>
                <button
                  type="button"
                  className={styles.toolbarLinkBtn}
                  disabled={deleteBusy || cardItems.length === 0}
                  onClick={selectAll}
                >
                  전체 선택
                </button>
                <button
                  type="button"
                  className={styles.toolbarLinkBtn}
                  disabled={deleteBusy || selectedCount === 0}
                  onClick={clearSelection}
                >
                  선택 해제
                </button>
              </div>
              <button
                type="button"
                className={styles.deleteSelectedBtn}
                disabled={deleteBusy || selectedCount === 0}
                onClick={() => void deleteSelected()}
              >
                {deleteBusy ? "삭제 중…" : `선택 삭제 (${selectedCount})`}
              </button>
            </div>
          </>
        ) : null}

        <div className={styles.cardGrid}>
          {cardItems.length === 0 && uid && !savedLoading ? (
            <p className="ui-ko" style={{ gridColumn: "1 / -1", opacity: 0.85 }}>
              아직 저장된 분석이 없습니다. 아래「분석 도구」에서 Signal Logic 또는 지문 심층 분석을 시작해 보세요.
            </p>
          ) : (
            cardItems.map((item) => (
              <PassageCard
                key={item.id}
                analysis={item}
                selectable={selectable}
                selected={selectedIds.has(item.id)}
                onToggleSelect={toggleSelect}
              />
            ))
          )}
        </div>
      </section>

      <section className={styles.analysisActions} aria-labelledby="logic-analysis-actions-heading">
        <h2 id="logic-analysis-actions-heading" className={styles.analysisActionsTitle}>
          분석 도구
          <span className={styles.sectionHeadingKo}>Signal Logic · 지문 심층</span>
        </h2>
        <p className={styles.analysisActionsKo}>
          시그널 로직은 이분법·원샷 시그널 중심 리포트를, 지문 심층 분석은 문장·의미 단위(/)와 직독·해석·어휘·문법 정리를 생성합니다. 둘 다 PDF(인쇄) 저장을 지원합니다.
        </p>
        <div className={styles.ctaPair}>
          <button type="button" className={styles.ctaLarge} onClick={() => setAnalysisOpen(true)}>
            <span className={styles.ctaPrimary}>Signal Logic 분석</span>
            <span className={styles.ctaSecondary}>이분법 · 원샷 시그널 · 어휘 리포트</span>
          </button>
          <button type="button" className={`${styles.ctaLarge} ${styles.ctaDeep}`} onClick={() => setDeepOpen(true)}>
            <span className={styles.ctaPrimary}>지문 심층 분석</span>
            <span className={styles.ctaSecondary}>문장·의미(/) · 직독·해석·문법</span>
          </button>
        </div>
      </section>

      <SignalLogicAnalysisModal open={analysisOpen} onClose={() => setAnalysisOpen(false)} />
      <PassageDeepAnalysisModal open={deepOpen} onClose={() => setDeepOpen(false)} />
    </main>
  );
}
