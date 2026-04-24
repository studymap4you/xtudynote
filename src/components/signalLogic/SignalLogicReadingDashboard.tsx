import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
} from "firebase/firestore";
import { SIGNAL_LOGIC_SAMPLE_ANALYSES } from "@/data/signalLogicReadingSamples";
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

function PassageCard({ analysis }: { analysis: SignalLogicPassageAnalysis }) {
  const { vocabulary, binaryLogic, signals, correctAnswer, originalText, analyzedAt, title } =
    analysis;
  const preview = clipText(originalText, 118);
  const binaryPreview = binaryLogic.slice(0, 4);
  const signalPreview = signals.slice(0, 2);

  return (
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
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [savedAnalyses, setSavedAnalyses] = useState<SignalLogicPassageAnalysis[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) {
      setSavedAnalyses([]);
      setSavedLoading(false);
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
  }, [firebaseUser?.uid]);

  const cardItems = useMemo(() => {
    if (firebaseUser?.uid) {
      return savedAnalyses;
    }
    return SIGNAL_LOGIC_SAMPLE_ANALYSES;
  }, [firebaseUser?.uid, savedAnalyses]);

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

      <section className={styles.recentSection} aria-labelledby="logic-recent-heading">
        <h2 id="logic-recent-heading" className={styles.sectionHeading}>
          최근 분석 지문
          <span className={styles.sectionHeadingKo}>Recently analyzed passages</span>
        </h2>
        <p style={{ marginTop: "-0.25rem", marginBottom: "0.75rem", fontSize: "0.9rem", opacity: 0.9 }}>
          {firebaseUser?.uid ? (
            <>
              <span className="ui-ko">로그인 계정에 저장된 분석이 최신순으로 표시됩니다.</span>
              {savedLoading ? (
                <span className="ui-ko" style={{ marginLeft: "0.5rem" }}>
                  불러오는 중…
                </span>
              ) : null}
            </>
          ) : (
            <span className="ui-ko">로그인하면 여기에 내 분석 기록이 쌓입니다. 아래는 예시 지문입니다.</span>
          )}
        </p>
        <div className={styles.cardGrid}>
          {cardItems.length === 0 && firebaseUser?.uid && !savedLoading ? (
            <p className="ui-ko" style={{ gridColumn: "1 / -1", opacity: 0.85 }}>
              아직 저장된 분석이 없습니다. 아래「새 분석 시작」으로 지문을 분석해 보세요.
            </p>
          ) : (
            cardItems.map((item) => <PassageCard key={item.id} analysis={item} />)
          )}
        </div>
      </section>

      <div className={styles.ctaRegion}>
        <button type="button" className={styles.ctaLarge} onClick={() => setAnalysisOpen(true)}>
          <span className={styles.ctaPrimary}>새 분석 시작</span>
          <span className={styles.ctaSecondary}>새 지문 분석 시작 · Start passage analysis</span>
        </button>
      </div>

      <SignalLogicAnalysisModal open={analysisOpen} onClose={() => setAnalysisOpen(false)} />
    </main>
  );
}
