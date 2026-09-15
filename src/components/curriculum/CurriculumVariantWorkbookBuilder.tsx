import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { CheckSquare, FileOutput, LoaderCircle, Square, WandSparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  buildCurriculumVariantWorkbook,
  loadCurriculumVariantItems,
  type CurriculumVariantSeriesId,
  type CurriculumVariantWorkbookItem,
} from "@/lib/curriculumVariantWorkbook";
import { resolveOutputCount, selectionShortfall } from "@/lib/examWorkbook";
import { MOCK_EXAM_VARIANT_TYPES } from "@/lib/mockExamNavigation";
import { DEFAULT_CSAT_TEMPLATE_ID, type CSATRenderTemplateId } from "@/lib/renderEngine/templateIds";
import type { CSATRenderInput } from "@/lib/renderEngine/types";
import styles from "./mockExamWorkbookBuilder.module.css";

const OUTPUT_COUNTS = [10, 20, 30, 40, 50, 60, 80, 100, 150, 200] as const;
const CSATBookletPreview = lazy(() => import("@/components/renderEngine/CSATBookletPreview").then((module) => ({ default: module.CSATBookletPreview })));
const CSATTemplatePicker = lazy(() => import("@/components/renderEngine/CSATTemplatePicker").then((module) => ({ default: module.CSATTemplatePicker })));

function itemTypeOrder(item: CurriculumVariantWorkbookItem) {
  const index = MOCK_EXAM_VARIANT_TYPES.findIndex((type) => type.id === item.variantType);
  return index < 0 ? 999 : index;
}

export function CurriculumVariantWorkbookBuilder({
  seriesId,
}: {
  seriesId: CurriculumVariantSeriesId;
}) {
  const { firebaseUser } = useAuth();
  const { entitled, loading: subscriptionLoading } = useSubscription();
  const navigate = useNavigate();
  const [items, setItems] = useState<CurriculumVariantWorkbookItem[]>([]);
  const [seriesTitle, setSeriesTitle] = useState("");
  const [seriesTarget, setSeriesTarget] = useState("고3 영어");
  const [activeGroupId, setActiveGroupId] = useState("");
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
    setItems([]);
    setSelected(new Set());
    setActiveGroupId("");
    setSeriesTitle("");
    setError("");
    setBuildNotice("");
    if (!firebaseUser || subscriptionLoading || !entitled) return () => { cancelled = true; };
    setLoading(true);
    void loadCurriculumVariantItems(firebaseUser, seriesId)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setSeriesTitle(result.series?.title || "");
        setSeriesTarget(result.series?.target || "고3 영어");
        const firstGroup = [...result.items]
          .sort((left, right) => left.groupOrder - right.groupOrder || left.sourceOrder - right.sourceOrder)[0]?.groupId || "";
        setActiveGroupId(firstGroup);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "변형문항을 불러오지 못했습니다.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entitled, firebaseUser, seriesId, subscriptionLoading]);

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; label: string; order: number; count: number }>();
    for (const item of items) {
      const current = map.get(item.groupId);
      if (current) current.count += 1;
      else map.set(item.groupId, { id: item.groupId, label: item.groupLabel, order: item.groupOrder, count: 1 });
    }
    return [...map.values()].sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "ko"));
  }, [items]);

  const activeGroup = groups.find((group) => group.id === activeGroupId) || groups[0];
  const visibleItems = useMemo(
    () => items.filter((item) => !activeGroup || item.groupId === activeGroup.id),
    [activeGroup, items],
  );
  const sources = useMemo(() => {
    const map = new Map<string, { id: string; label: string; order: number; page?: number; items: CurriculumVariantWorkbookItem[] }>();
    for (const item of visibleItems) {
      const current = map.get(item.sourceId);
      if (current) current.items.push(item);
      else map.set(item.sourceId, {
        id: item.sourceId,
        label: item.sourceLabel,
        order: item.sourceOrder,
        page: item.sourcePage,
        items: [item],
      });
    }
    return [...map.values()]
      .map((source) => ({ ...source, items: source.items.sort((a, b) => itemTypeOrder(a) - itemTypeOrder(b) || (a.variantIndex || 1) - (b.variantIndex || 1)) }))
      .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "ko"));
  }, [visibleItems]);

  const availableKeys = useMemo(() => new Set(items.map((item) => item.key)), [items]);
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

  const selectKeys = (keys: string[]) => {
    setSelected((current) => {
      const next = new Set(current);
      keys.forEach((key) => { if (availableKeys.has(key)) next.add(key); });
      return next;
    });
  };

  const clearKeys = (keys: string[]) => {
    const keySet = new Set(keys);
    setSelected((current) => new Set([...current].filter((key) => !keySet.has(key))));
  };

  const generate = async () => {
    if (!firebaseUser) { navigate("/login"); return; }
    if (subscriptionLoading || !entitled) { navigate("/billing"); return; }
    if (!selectedCount) { setError("출력할 변형문제를 선택해주세요."); return; }
    if (shortfall) { setError(`${shortfall}개 문항을 더 선택해주세요.`); return; }
    setBuilding(true);
    setError("");
    setBuildNotice("");
    try {
      const result = await buildCurriculumVariantWorkbook(firebaseUser, {
        seriesId,
        selections: [...selected],
        targetCount,
      });
      setBuildNotice(result.excludedCount
        ? `${result.selectedCount}개 중 ${result.excludedCount}개를 무작위 제외하여 ${result.outputCount}개를 구성했습니다.`
        : `${result.outputCount}개 문항을 모두 출력에 포함했습니다.`);
      setPreview({
        title: `${seriesTitle || "EBS 교재"} 맞춤 변형문제`,
        subtitle: `선택 문항 ${result.selectedCount}개 · 최종 출력 ${result.outputCount}개`,
        target: seriesTarget,
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

  const visibleKeys = visibleItems.map((item) => item.key);
  const visibleSelectedCount = visibleKeys.filter((key) => selected.has(key)).length;
  const allVisibleSelected = visibleKeys.length > 0 && visibleSelectedCount === visibleKeys.length;

  return (
    <section className={styles.builder} aria-labelledby={`curriculum-workbook-${seriesId}`}>
      <header className={styles.heading}>
        <div>
          <span>QUESTION BANK</span>
          <h3 id={`curriculum-workbook-${seriesId}`}>원문별 변형문제 선택</h3>
          <p>각 원문 번호에서 등록된 11개 변형 유형을 골라 한 권의 문제집으로 출력합니다.</p>
        </div>
        <div className={styles.summary}><strong>{selectedCount}</strong><span>선택됨</span></div>
      </header>

      {!firebaseUser ? <p className={styles.gate}>문항 선택과 출력은 로그인 후 이용할 수 있습니다.</p> : null}
      {firebaseUser && !subscriptionLoading && !entitled ? <p className={styles.gate}>문항 선택과 출력은 구독 후 이용할 수 있습니다.</p> : null}
      {loading ? <p className={styles.loading}><LoaderCircle size={18} className={styles.spin} /> 등록 문항 확인 중</p> : null}

      {groups.length ? (
        <div className={styles.bulkBar} aria-label="교재 단원 선택">
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={activeGroup?.id === group.id}
              onClick={() => setActiveGroupId(group.id)}
            >
              {group.label} · {group.count}문항
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.bulkBar}>
        <button type="button" onClick={() => selectKeys(visibleKeys)} disabled={!visibleKeys.length || allVisibleSelected}><CheckSquare size={16} /> 현재 단원 전체 선택</button>
        <button type="button" onClick={() => clearKeys(visibleKeys)} disabled={!visibleSelectedCount}><Square size={16} /> 현재 단원 해제</button>
        <button type="button" onClick={() => setSelected(new Set(availableKeys))} disabled={!availableKeys.size || selectedCount === availableKeys.size}><CheckSquare size={16} /> 교재 전체 선택</button>
        <button type="button" onClick={() => setSelected(new Set())} disabled={!selectedCount}><Square size={16} /> 전체 해제</button>
        <span>보류·미등록 유형은 선택할 수 없습니다.</span>
      </div>

      {!loading && firebaseUser && entitled && items.length === 0 ? (
        <p className={styles.gate}>아직 이 교재의 문항 데이터가 문제은행에 등록되지 않았습니다.</p>
      ) : null}

      <div className={styles.questionList}>
        {sources.map((source) => {
          const sourceKeys = source.items.map((item) => item.key);
          const selectedForSource = sourceKeys.filter((key) => selected.has(key)).length;
          return (
            <article key={source.id} className={styles.questionRow}>
              <header>
                <strong>{source.label}</strong>
                <span>{selectedForSource}/{source.items.length} 선택{source.page ? ` · p.${source.page}` : ""}</span>
                <div>
                  <button type="button" onClick={() => selectKeys(sourceKeys)} disabled={!sourceKeys.length}>변형 전체</button>
                  <button type="button" onClick={() => clearKeys(sourceKeys)} disabled={!selectedForSource}>해제</button>
                </div>
              </header>
              <div className={styles.checkboxGrid}>
                {MOCK_EXAM_VARIANT_TYPES.map((variant) => {
                  const variantItems = source.items.filter((item) => item.variantType === variant.id);
                  return variantItems.length ? variantItems.map((item) => (
                    <label key={item.key}>
                      <input type="checkbox" checked={selected.has(item.key)} onChange={() => toggle(item.key)} />
                      <span>{variant.label}{variantItems.length > 1 ? ` ${item.variantIndex || 1}` : ""}</span>
                      <small>등록</small>
                    </label>
                  )) : (
                    <label key={variant.id} data-disabled>
                      <input type="checkbox" disabled />
                      <span>{variant.label}</span>
                      <small>미등록/보류</small>
                    </label>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>

      <section className={styles.outputSection}>
        <div className={styles.outputHeading}><FileOutput size={20} /><div><h3>최종 출력 설정</h3><p>선택한 원문·유형만 사용하며, 출력 수가 더 적으면 필요한 수만 무작위 추출합니다.</p></div></div>
        <fieldset className={styles.countPicker}><legend>문제 수</legend>
          {OUTPUT_COUNTS.map((count) => <label key={count}><input type="radio" name={`curriculum-output-${seriesId}`} checked={targetChoice === count} onChange={() => setTargetChoice(count)} /><span>{count}문제</span></label>)}
          <label><input type="radio" name={`curriculum-output-${seriesId}`} checked={targetChoice === "all"} onChange={() => setTargetChoice("all")} /><span>전체 ({selectedCount})</span></label>
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
