import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CheckSquare, FileOutput, LoaderCircle, Square, WandSparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { buildExamWorkbook, loadExamWorkbookItems, resolveOutputCount, selectionShortfall, type ExamWorkbookItem } from "@/lib/examWorkbook";
import { DEFAULT_CSAT_TEMPLATE_ID, type CSATRenderTemplateId } from "@/lib/renderEngine/templateIds";
import type { CSATRenderInput } from "@/lib/renderEngine/types";
import { ENGLISH_MOCK_EXAM_QUESTION_NUMBERS, MOCK_EXAM_VARIANT_TYPES } from "@/lib/mockExamNavigation";
import type { OfficialExamResource } from "@/lib/officialExamResources";
import styles from "./mockExamWorkbookBuilder.module.css";

const OUTPUT_COUNTS = [10, 20, 30, 40, 50, 60, 80, 100] as const;
const CSATBookletPreview = lazy(() => import("@/components/renderEngine/CSATBookletPreview").then((module) => ({ default: module.CSATBookletPreview })));
const CSATTemplatePicker = lazy(() => import("@/components/renderEngine/CSATTemplatePicker").then((module) => ({ default: module.CSATTemplatePicker })));

export function MockExamWorkbookBuilder({ exam }: { exam: OfficialExamResource }) {
  const { firebaseUser } = useAuth();
  const { entitled, loading: subscriptionLoading } = useSubscription();
  const navigate = useNavigate();
  const [availableItems, setAvailableItems] = useState<ExamWorkbookItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [targetChoice, setTargetChoice] = useState<number | "all">(30);
  const [templateId, setTemplateId] = useState<CSATRenderTemplateId>(DEFAULT_CSAT_TEMPLATE_ID);
  const [preview, setPreview] = useState<CSATRenderInput | null>(null);
  const [buildNotice, setBuildNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    setSelected(new Set());
    setAvailableItems([]);
    setError("");
    setBuildNotice("");
    if (!firebaseUser || exam.placeholder) return () => { cancelled = true; };
    if (subscriptionLoading || !entitled) return () => { cancelled = true; };
    setLoading(true);
    void loadExamWorkbookItems(firebaseUser, exam.id)
      .then((items) => { if (!cancelled) setAvailableItems(items); })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "문항을 불러오지 못했습니다."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entitled, exam.id, exam.placeholder, firebaseUser, subscriptionLoading]);

  const availableKeys = useMemo(() => new Set(availableItems.map((item) => item.key)), [availableItems]);
  const selectedCount = selected.size;
  const targetCount = resolveOutputCount(selectedCount, targetChoice);
  const shortfall = selectionShortfall(selectedCount, targetChoice);

  const toggle = (key: string) => {
    if (!availableKeys.has(key)) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const setQuestionSelection = (questionNumber: number, includeOriginal: boolean) => {
    const candidateKeys = availableItems
      .filter((item) => item.questionNumber === questionNumber && (includeOriginal || item.kind !== "original"))
      .map((item) => item.key);
    setSelected((current) => {
      const next = new Set(current);
      candidateKeys.forEach((key) => next.add(key));
      return next;
    });
  };

  const clearQuestion = (questionNumber: number) => {
    setSelected((current) => new Set([...current].filter((key) => !key.startsWith(`${questionNumber}:`))));
  };

  const generate = async () => {
    if (!firebaseUser) { navigate("/login"); return; }
    if (subscriptionLoading || !entitled) { navigate("/billing"); return; }
    if (!selectedCount) { setError("출력할 원형 또는 변형문제를 선택해주세요."); return; }
    if (shortfall) { setError(`${shortfall}개 문항을 더 선택해주세요.`); return; }
    setBuilding(true);
    setError("");
    setBuildNotice("");
    try {
      const result = await buildExamWorkbook(firebaseUser, {
        examId: exam.id,
        selections: [...selected],
        targetCount,
      });
      setBuildNotice(result.excludedCount
        ? `${result.selectedCount}개 중 ${result.excludedCount}개를 무작위 제외하여 ${result.outputCount}개를 구성했습니다.`
        : `${result.outputCount}개 문항을 모두 출력에 포함했습니다.`);
      setPreview({
        title: `${exam.title} 맞춤 변형문제`,
        subtitle: `선택 문항 ${result.selectedCount}개 · 최종 출력 ${result.outputCount}개`,
        target: `고${exam.grade} 영어`,
        templateId,
        questions: result.questions,
        options: { mode: "student", showAnswerKey: false, showQuestionType: true },
      });
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "문제집을 만들지 못했습니다.");
    } finally {
      setBuilding(false);
    }
  };

  const allAvailableSelected = availableKeys.size > 0 && [...availableKeys].every((key) => selected.has(key));

  return (
    <section className={styles.builder} aria-labelledby="exam-workbook-builder-title">
      <header className={styles.heading}>
        <div><span>WORKBOOK BUILDER</span><h3 id="exam-workbook-builder-title">출력 문항 선택</h3><p>원형 문제와 11개 변형 유형을 여러 개 선택해 한 권의 문제집으로 출력합니다.</p></div>
        <div className={styles.summary}><strong>{selectedCount}</strong><span>선택됨</span></div>
      </header>

      {!firebaseUser ? <p className={styles.gate}>문항 선택과 출력은 로그인 후 이용할 수 있습니다.</p> : null}
      {firebaseUser && !subscriptionLoading && !entitled ? <p className={styles.gate}>문항 선택과 출력은 구독 후 이용할 수 있습니다.</p> : null}
      {loading ? <p className={styles.loading}><LoaderCircle size={18} className={styles.spin} /> 등록 문항 확인 중</p> : null}

      <div className={styles.bulkBar}>
        <button type="button" onClick={() => setSelected(new Set(availableKeys))} disabled={!availableKeys.size || allAvailableSelected}><CheckSquare size={16} /> 등록 문항 전체 선택</button>
        <button type="button" onClick={() => setSelected(new Set())} disabled={!selectedCount}><Square size={16} /> 전체 해제</button>
        <span>미등록 항목은 선택할 수 없습니다.</span>
      </div>

      <div className={styles.questionList}>
        {ENGLISH_MOCK_EXAM_QUESTION_NUMBERS.map((questionNumber) => {
          const itemsForQuestion = availableItems.filter((item) => item.questionNumber === questionNumber);
          const originalItems = itemsForQuestion.filter((item) => item.kind === "original");
          const availableCount = [...availableKeys].filter((key) => key.startsWith(`${questionNumber}:`)).length;
          const selectedForQuestion = [...selected].filter((key) => key.startsWith(`${questionNumber}:`)).length;
          return (
            <article key={questionNumber} className={styles.questionRow}>
              <header>
                <strong>{questionNumber}번</strong><span>{selectedForQuestion}/{availableCount} 선택</span>
                <div>
                  <button type="button" onClick={() => setQuestionSelection(questionNumber, false)} disabled={!availableCount}>변형 전체</button>
                  <button type="button" onClick={() => setQuestionSelection(questionNumber, true)} disabled={!availableCount}>원형 + 변형</button>
                  <button type="button" onClick={() => clearQuestion(questionNumber)} disabled={!selectedForQuestion}>해제</button>
                </div>
              </header>
              <div className={styles.checkboxGrid}>
                {originalItems.length ? originalItems.map((item) => (
                  <label key={item.key}>
                    <input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} />
                    <span>원형 문제{originalItems.length > 1 ? ` ${item.variantIndex || 1}` : ""}</span><small>등록</small>
                  </label>
                )) : (
                  <label data-disabled>
                    <input type="checkbox" disabled />
                    <span>원형 문제</span><small>미등록</small>
                  </label>
                )}
                {MOCK_EXAM_VARIANT_TYPES.map((variant) => {
                  const variantItems = itemsForQuestion.filter((item) => item.variantType === variant.id);
                  return variantItems.length ? variantItems.map((item) => (
                    <label key={item.key}>
                      <input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} />
                      <span>{variant.label}{variantItems.length > 1 ? ` ${item.variantIndex || 1}` : ""}</span><small>등록</small>
                    </label>
                  )) : (
                    <label key={variant.id} data-disabled>
                      <input type="checkbox" disabled />
                      <span>{variant.label}</span><small>미등록</small>
                    </label>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      <section className={styles.outputSection}>
        <div className={styles.outputHeading}><FileOutput size={20} /><div><h3>최종 출력 설정</h3><p>출력 수가 선택 수보다 적으면 서버에서 필요한 수만큼 무작위로 제외합니다.</p></div></div>
        <fieldset className={styles.countPicker}><legend>문제 수</legend>
          {OUTPUT_COUNTS.map((count) => <label key={count}><input type="radio" name="output-count" checked={targetChoice === count} onChange={() => setTargetChoice(count)} /><span>{count}문제</span></label>)}
          <label><input type="radio" name="output-count" checked={targetChoice === "all"} onChange={() => setTargetChoice("all")} /><span>전체 ({selectedCount})</span></label>
        </fieldset>
        {shortfall ? <p className={styles.shortfall} role="status">현재 선택으로는 부족합니다. {shortfall}개 문항을 더 선택해주세요.</p> : null}
        <Suspense fallback={<p className={styles.loading}>교재 디자인 불러오는 중</p>}>
          <CSATTemplatePicker value={templateId} onChange={setTemplateId} />
        </Suspense>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        {buildNotice ? <p className={styles.success} role="status">{buildNotice}</p> : null}
        <button type="button" className={styles.buildButton} onClick={() => void generate()} disabled={building || !selectedCount || Boolean(shortfall)}>
          {building ? <LoaderCircle size={18} className={styles.spin} /> : <WandSparkles size={18} />}
          {building ? "문제집 구성 중" : `${targetCount || 0}문제 미리보기 및 출력`}
        </button>
      </section>

      {preview ? (
        <Suspense fallback={<p className={styles.loading}>미리보기 불러오는 중</p>}>
          <CSATBookletPreview input={preview} onClose={() => setPreview(null)} onTemplateChange={(next) => { setTemplateId(next); setPreview((current) => current ? { ...current, templateId: next } : current); }} />
        </Suspense>
      ) : null}
    </section>
  );
}
