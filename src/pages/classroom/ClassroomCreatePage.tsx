import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { TeacherRoute } from "@/components/TeacherRoute";
import { DashboardShell } from "@/components/DashboardShell";
import { RichHtmlView } from "@/components/RichHtmlView";
import { RichTextEditor } from "@/components/RichTextEditor";
import { db } from "@/firebase/config";
import { mergeIntroductionWithKnowledgeMaterial, knowledgeMaterialAppendHtml } from "@/lib/classroomIntroMerge";
import { parseTuitionKrwInput } from "@/lib/formatTuitionKrw";
import { getKnowledgeMaterial, listKnowledgeMaterials } from "@/lib/knowledgeCuration/knowledgeCurationApi";
import type { KnowledgeMaterialDoc } from "@/types/knowledgeCuration";
import type { ClassroomPricingType } from "@/types/classroom";
import "@/pages/pages.css";

function Inner() {
  const { firebaseUser, isSuperAdmin } = useAuth();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pricingType, setPricingType] = useState<ClassroomPricingType>("free");
  const [tuitionFeeInput, setTuitionFeeInput] = useState("");

  const [knowledgeMaterials, setKnowledgeMaterials] = useState<{ id: string; data: KnowledgeMaterialDoc }[]>([]);
  const [knowledgeMaterialId, setKnowledgeMaterialId] = useState<string>("");
  const [mergeBlockHtml, setMergeBlockHtml] = useState("");

  useEffect(() => {
    if (!isSuperAdmin || !firebaseUser?.uid) {
      setKnowledgeMaterials([]);
      setKnowledgeMaterialId("");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await listKnowledgeMaterials(firebaseUser.uid);
        if (!cancelled) setKnowledgeMaterials(list);
      } catch {
        if (!cancelled) setKnowledgeMaterials([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, firebaseUser?.uid]);

  useEffect(() => {
    if (!isSuperAdmin || !knowledgeMaterialId.trim()) {
      setMergeBlockHtml("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const mat = await getKnowledgeMaterial(knowledgeMaterialId.trim());
        if (cancelled) return;
        if (mat?.bodyMarkdown) setMergeBlockHtml(knowledgeMaterialAppendHtml(mat.bodyMarkdown));
        else setMergeBlockHtml("");
      } catch {
        if (!cancelled) setMergeBlockHtml("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, knowledgeMaterialId]);

  const previewHtml = useMemo(() => {
    const base = introduction.trim() || description.trim();
    if (!base && !mergeBlockHtml) return "";
    const core = base || "";
    return mergeBlockHtml ? (core ? `${core}${mergeBlockHtml}` : mergeBlockHtml) : core;
  }, [introduction, description, mergeBlockHtml]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) {
      setErr("로그인 정보가 없습니다. 새로고침 후 다시 시도해 주세요.");
      return;
    }
    const t = title.trim();
    if (!t) {
      setErr("강의실 이름을 입력해 주세요.");
      return;
    }
    if (pricingType === "paid") {
      const fee = parseTuitionKrwInput(tuitionFeeInput);
      if (fee == null) {
        setErr("유료로 개설할 때는 수강가격(원)을 1원 이상 99,999,999원 이하로 입력해 주세요.");
        return;
      }
    }
    setSaving(true);
    setErr(null);
    try {
      let intro = introduction.trim();
      const matId = knowledgeMaterialId.trim();
      if (isSuperAdmin && matId) {
        const mat = await getKnowledgeMaterial(matId);
        if (mat?.bodyMarkdown) {
          intro = mergeIntroductionWithKnowledgeMaterial(intro, mat.bodyMarkdown);
        }
      }

      const payload: Record<string, unknown> = {
        teacherId: firebaseUser.uid,
        title: t,
        description: description.trim(),
        introduction: intro,
        pricingType,
        createdAt: serverTimestamp(),
      };
      if (pricingType === "paid") {
        payload.tuitionFeeKrw = parseTuitionKrwInput(tuitionFeeInput);
      }
      if (isSuperAdmin && matId) {
        payload.knowledgeMaterialId = matId;
      }

      const ref = await addDoc(collection(db, "classrooms"), payload);
      nav(`/classroom/${ref.id}/manage`, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light classroom-hub classroom-hub--manage">
        <div className="classroom-hub__shell">
          <div className="classroom-hub__hero-card">
            <nav className="classroom-page__breadcrumb">
              <Link to="/classroom">← 강의실 목록</Link>
            </nav>
            <div className="admin-layout__title-row">
              <h1>강의실 개설</h1>
              <span className="ui-ko">개설 후 관리 화면에서 소개·자료·영상·질의응답을 이어서 설정합니다</span>
            </div>
            <p className="classroom-page__lede classroom-hub__hero-lede">
              <span className="ui-en" style={{ display: "block", marginBottom: "0.35rem" }}>
                After creation you land on the same hub as manage: Intro, Materials, Video, and Q&amp;A tabs.
              </span>
              <span className="ui-ko">
                아래에서 이름과 소개를 입력하면 <strong>강의실 허브</strong>로 이동합니다. 자료·영상은 검수 정책에 따라
                신청·연결됩니다.
                {isSuperAdmin ? (
                  <>
                    {" "}
                    마스터는 <strong>지식 큐레이션</strong>에서 만든 학습자료를 선택하면 강의 소개에 자동으로 붙입니다.
                  </>
                ) : null}
              </span>
            </p>

            <p className="classroom-hub__preview-label classroom-hub__preview-label--hero">개설 후 사용할 영역 (미리보기)</p>
            <div className="classroom-hub__tabs" role="presentation" aria-hidden="true">
              {(
                [
                  ["intro", "강의 소개", "이름·요약·본문"],
                  ["materials", "강의 자료", "파일·신청"],
                  ["video", "강의 영상", "URL·신청"],
                  ["qa", "질의응답", "게시판"],
                ] as const
              ).map(([key, label, sub]) => (
                <button
                  key={key}
                  type="button"
                  disabled
                  className="classroom-hub__tab classroom-hub__tab--preview"
                  tabIndex={-1}
                >
                  <span className="classroom-hub__tab-label">{label}</span>
                  <span className="classroom-hub__tab-sub">{sub}</span>
                </button>
              ))}
            </div>
          </div>

          {err && <p className="auth-error">{err}</p>}

          <div className="classroom-hub__panel classroom-hub__panel--manage">
            <section className="classroom-hub__section">
              <h2 className="classroom-hub__section-title">기본 정보</h2>
              <p className="classroom-hub__hint">
                관리 화면의 <strong>강의 소개</strong> 탭과 같은 항목입니다. 나중에 언제든지 수정할 수 있습니다.
              </p>
              <form className="classroom-hub__form" onSubmit={(e) => void handleSubmit(e)}>
                <div className="classroom-hub__card">
                  <h3 className="classroom-hub__card-title">강의실 요약</h3>
                  <label className="auth-field">
                    <span className="classroom-hub__field-label">강의실 이름</span>
                    <input
                      className="add-passage__control"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="예: 고2 통합수학 A반"
                      required
                    />
                  </label>
                  <label className="auth-field">
                    <span className="classroom-hub__field-label">요약 (한 줄, 선택)</span>
                    <input
                      className="add-passage__control"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="예: 고2 통합수학 A반 · 2026 봄"
                    />
                  </label>
                  <label className="auth-field">
                    <span className="classroom-hub__field-label">강의 유형 · 수강 신청</span>
                    <select
                      className="add-passage__control"
                      value={pricingType}
                      onChange={(e) => setPricingType(e.target.value === "paid" ? "paid" : "free")}
                    >
                      <option value="free">무료 — 학생이 목록에서 바로 수강(멤버 등록)</option>
                      <option value="paid">유료 — 수강신청요청 후 강사 승인 (연락처 접수)</option>
                    </select>
                  </label>
                  {pricingType === "paid" ? (
                    <label className="auth-field">
                      <span className="classroom-hub__field-label">수강 가격 (원)</span>
                      <span className="classroom-hub__field-hint">
                        강의실 목록과 수강신청요청 팝업에 표시됩니다.
                      </span>
                      <input
                        className="add-passage__control"
                        inputMode="numeric"
                        autoComplete="off"
                        value={tuitionFeeInput}
                        onChange={(e) => setTuitionFeeInput(e.target.value)}
                        placeholder="예: 150000"
                      />
                    </label>
                  ) : null}
                  {isSuperAdmin && knowledgeMaterials.length > 0 ? (
                    <label className="auth-field">
                      <span className="classroom-hub__field-label">지식 큐레이션 학습자료 (선택)</span>
                      <span className="classroom-hub__field-hint">
                        선택 시 개설 직후「강의 소개」본문 끝에 큐레이션 학습자료가 합쳐지며, 문서 ID가 강의실에 기록됩니다.
                      </span>
                      <select
                        className="add-passage__control"
                        value={knowledgeMaterialId}
                        onChange={(e) => setKnowledgeMaterialId(e.target.value)}
                      >
                        <option value="">연결 안 함</option>
                        {knowledgeMaterials.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.data.title} · {m.id.slice(0, 8)}…
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>

                <div className="classroom-hub__card classroom-hub__card--soft">
                  <h3 className="classroom-hub__card-title">강의 소개 (선택)</h3>
                  <div className="auth-field classroom-hub__field classroom-hub__field--intro">
                    <span className="classroom-hub__field-hint classroom-hub__field-hint--block">
                      굵게·링크·이미지 등 서식을 쓸 수 있습니다. 목표·주차·과제·시험 정책 등을 넉넉히 적을수록 학습자에게
                      도움이 됩니다.
                      {isSuperAdmin && knowledgeMaterialId ? " 큐레이션 자료는 아래 미리보기에 합쳐진 뒤 저장됩니다." : ""}
                    </span>
                    <RichTextEditor
                      value={introduction}
                      onChange={setIntroduction}
                      placeholder="수업 목표, 주차 안내, 과제·시험 정책 등"
                      userId={firebaseUser?.uid}
                    />
                  </div>
                </div>

                <div className="classroom-hub__card">
                  <p className="classroom-hub__preview-label">미리보기 (입장·관리 화면과 동일)</p>
                  <div className="classroom-hub__preview">
                    {previewHtml ? (
                      <RichHtmlView html={previewHtml} />
                    ) : (
                      "소개 글이 비어 있으면 요약만 표시됩니다."
                    )}
                  </div>
                  <div className="add-passage__actions classroom-hub__form-actions">
                    <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
                      {saving ? "저장 중…" : "개설하고 허브로 이동"}
                    </button>
                    <Link to="/classroom" className="btn btn--ghost btn--stack">
                      취소
                    </Link>
                  </div>
                </div>
              </form>
            </section>
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}

export function ClassroomCreatePage() {
  return (
    <TeacherRoute>
      <Inner />
    </TeacherRoute>
  );
}
