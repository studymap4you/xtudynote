import { FirebaseError } from "firebase/app";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { TeacherRoute } from "@/components/TeacherRoute";
import { DashboardShell } from "@/components/DashboardShell";
import { RichHtmlView } from "@/components/RichHtmlView";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ClassroomQaBoard } from "@/components/classroom/ClassroomQaBoard";
import { db } from "@/firebase/config";
import { getClassroomIntroBody } from "@/lib/classroomDisplay";
import type { ClassroomDocument, ClassroomEnrollmentRequestDocument } from "@/types/classroom";
import type { MaterialRequestDocument } from "@/types/materialRequest";
import type { VideoMaterialRequestDocument } from "@/types/videoMaterialRequest";
import { collectVideoUrlsFromRequest } from "@/lib/videoMaterialUrls";
import "@/pages/pages.css";

type TabId = "intro" | "materials" | "video" | "qa" | "enrollment" | "members";

function tsLabel(t: unknown): string {
  if (t && typeof t === "object" && "toMillis" in t && typeof (t as { toMillis: () => number }).toMillis === "function") {
    return new Date((t as { toMillis: () => number }).toMillis()).toLocaleString();
  }
  return "";
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const { firebaseUser } = useAuth();
  const [room, setRoom] = useState<(ClassroomDocument & { id: string }) | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("intro");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [savingIntro, setSavingIntro] = useState(false);
  const [introErr, setIntroErr] = useState<string | null>(null);
  const [introSaveOk, setIntroSaveOk] = useState<string | null>(null);
  const introFeedbackRef = useRef<HTMLDivElement>(null);

  const [materialRows, setMaterialRows] = useState<{ id: string; data: MaterialRequestDocument }[]>([]);
  const [videoRows, setVideoRows] = useState<{ id: string; data: VideoMaterialRequestDocument }[]>([]);
  const [listsLoading, setListsLoading] = useState(false);

  const [memberIdsText, setMemberIdsText] = useState("");
  const [savingMembers, setSavingMembers] = useState(false);
  const [membersErr, setMembersErr] = useState<string | null>(null);

  const [pricingType, setPricingType] = useState<"free" | "paid">("free");
  const [enrollmentRows, setEnrollmentRows] = useState<{ id: string; data: ClassroomEnrollmentRequestDocument }[]>([]);
  const [enrollmentLoading, setEnrollmentLoading] = useState(false);
  const [enrollmentActionErr, setEnrollmentActionErr] = useState<string | null>(null);
  const [enrollmentBusyId, setEnrollmentBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !firebaseUser) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await getDoc(doc(db, "classrooms", id));
        if (!s.exists()) {
          if (!cancelled) setRoom(null);
          return;
        }
        const d = s.data() as ClassroomDocument;
        if (d.teacherId !== firebaseUser.uid) {
          if (!cancelled) setForbidden(true);
          return;
        }
        if (!cancelled) {
          setRoom({ id: s.id, ...d });
          setTitle(d.title);
          setDescription(d.description ?? "");
          setIntroduction(d.introduction ?? "");
          setPricingType(d.pricingType === "paid" ? "paid" : "free");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, firebaseUser]);

  useEffect(() => {
    if (room) {
      setMemberIdsText((room.memberStudentIds ?? []).join("\n"));
    }
  }, [room]);

  useEffect(() => {
    if (!id || tab !== "enrollment" || !room) return;
    setEnrollmentLoading(true);
    setEnrollmentActionErr(null);
    const q = query(
      collection(db, "classrooms", id, "enrollment_requests"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows: { id: string; data: ClassroomEnrollmentRequestDocument }[] = [];
        snap.forEach((d) => rows.push({ id: d.id, data: d.data() as ClassroomEnrollmentRequestDocument }));
        setEnrollmentRows(rows);
        setEnrollmentLoading(false);
      },
      (e) => {
        setEnrollmentActionErr(e.message || "목록을 불러오지 못했습니다.");
        setEnrollmentLoading(false);
      },
    );
    return () => unsub();
  }, [id, tab, room]);

  useEffect(() => {
    if (!id || !room) return;
    let cancelled = false;
    (async () => {
      setListsLoading(true);
      try {
        const mq = query(collection(db, "material_requests"), where("classroomId", "==", id));
        const vq = query(collection(db, "video_material_requests"), where("classroomId", "==", id));
        const [ms, vs] = await Promise.all([getDocs(mq), getDocs(vq)]);
        if (cancelled) return;
        const mat: { id: string; data: MaterialRequestDocument }[] = [];
        const vid: { id: string; data: VideoMaterialRequestDocument }[] = [];
        ms.forEach((d) => mat.push({ id: d.id, data: d.data() as MaterialRequestDocument }));
        vs.forEach((d) => vid.push({ id: d.id, data: d.data() as VideoMaterialRequestDocument }));
        mat.sort((a, b) => {
          const ta = a.data.createdAt as { toMillis?: () => number } | undefined;
          const tb = b.data.createdAt as { toMillis?: () => number } | undefined;
          return (tb?.toMillis?.() ?? 0) - (ta?.toMillis?.() ?? 0);
        });
        vid.sort((a, b) => {
          const ta = a.data.createdAt as { toMillis?: () => number } | undefined;
          const tb = b.data.createdAt as { toMillis?: () => number } | undefined;
          return (tb?.toMillis?.() ?? 0) - (ta?.toMillis?.() ?? 0);
        });
        setMaterialRows(mat);
        setVideoRows(vid);
      } finally {
        if (!cancelled) setListsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, room]);

  useEffect(() => {
    if (!introSaveOk) return;
    const t = window.setTimeout(() => setIntroSaveOk(null), 6000);
    return () => window.clearTimeout(t);
  }, [introSaveOk]);

  useEffect(() => {
    if (!introErr && !introSaveOk) return;
    introFeedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [introErr, introSaveOk]);

  const q = (path: string) => `${path}?classroomId=${encodeURIComponent(id ?? "")}`;

  async function saveMembers(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !room) return;
    const raw = memberIdsText
      .split(/[\s,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    const uniq = [...new Set(raw)].slice(0, 120);
    setSavingMembers(true);
    setMembersErr(null);
    try {
      await updateDoc(doc(db, "classrooms", id), { memberStudentIds: uniq });
      setRoom({ ...room, memberStudentIds: uniq });
    } catch (err) {
      setMembersErr(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSavingMembers(false);
    }
  }

  function introSaveErrorMessage(err: unknown): string {
    if (err instanceof FirebaseError && err.code === "permission-denied") {
      return "저장 권한이 없습니다. 계정 역할·강의실 소유를 확인해 주세요.";
    }
    return err instanceof Error ? err.message : "저장에 실패했습니다.";
  }

  async function approveEnrollment(studentId: string) {
    if (!id || !room) return;
    setEnrollmentBusyId(studentId);
    setEnrollmentActionErr(null);
    try {
      const batch = writeBatch(db);
      const cRef = doc(db, "classrooms", id);
      const rRef = doc(db, "classrooms", id, "enrollment_requests", studentId);
      batch.update(cRef, { memberStudentIds: arrayUnion(studentId) });
      batch.update(rRef, { status: "approved", reviewedAt: serverTimestamp() });
      await batch.commit();
      setRoom((prev) =>
        prev ? { ...prev, memberStudentIds: [...new Set([...(prev.memberStudentIds ?? []), studentId])] } : prev,
      );
    } catch (e) {
      setEnrollmentActionErr(e instanceof Error ? e.message : "승인에 실패했습니다.");
    } finally {
      setEnrollmentBusyId(null);
    }
  }

  async function rejectEnrollment(studentId: string) {
    if (!id) return;
    setEnrollmentBusyId(studentId);
    setEnrollmentActionErr(null);
    try {
      await updateDoc(doc(db, "classrooms", id, "enrollment_requests", studentId), {
        status: "rejected",
        reviewedAt: serverTimestamp(),
      });
    } catch (e) {
      setEnrollmentActionErr(e instanceof Error ? e.message : "처리에 실패했습니다.");
    } finally {
      setEnrollmentBusyId(null);
    }
  }

  async function saveIntro(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !firebaseUser || !room) return;
    const t = title.trim();
    if (!t) {
      setIntroSaveOk(null);
      setIntroErr("강의실 이름을 입력해 주세요.");
      return;
    }
    setSavingIntro(true);
    setIntroErr(null);
    setIntroSaveOk(null);
    try {
      await updateDoc(doc(db, "classrooms", id), {
        title: t,
        description: description.trim(),
        introduction: introduction.trim(),
        pricingType,
      });
      setRoom({
        ...room,
        title: t,
        description: description.trim(),
        introduction: introduction.trim(),
        pricingType,
      });
      setIntroSaveOk("저장했습니다. 입장 화면에도 곧바로 반영됩니다.");
    } catch (err) {
      setIntroErr(introSaveErrorMessage(err));
    } finally {
      setSavingIntro(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell light>
        <div className="route-loading route-loading--light">
          <div className="route-loading__spinner" />
          <p className="ui-ko">확인 중…</p>
        </div>
      </DashboardShell>
    );
  }

  if (forbidden || !room) {
    return (
      <DashboardShell light>
        <main className="admin-layout classroom-page admin-layout--light">
          <p className="auth-error">
            {forbidden ? "이 강의실을 관리할 권한이 없습니다." : "강의실을 찾을 수 없습니다."}
          </p>
          <Link to="/classroom" className="btn btn--ghost btn--stack">
            목록으로
          </Link>
        </main>
      </DashboardShell>
    );
  }

  const tabs: { id: TabId; label: string; sub: string }[] = [
    { id: "intro", label: "강의 소개", sub: "이름·요약·상세 소개" },
    { id: "materials", label: "강의 자료", sub: "파일 업로드·신청 현황" },
    { id: "video", label: "강의 영상", sub: "영상 URL 등록·신청 현황" },
    { id: "qa", label: "질의응답", sub: "게시판" },
    { id: "enrollment", label: "수강 신청", sub: "유료 대기 · 연락처" },
    { id: "members", label: "학습지 멤버", sub: "학생 UID 목록" },
  ];

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light classroom-hub">
        <nav className="classroom-page__breadcrumb">
          <Link to="/classroom">← 강의실 목록</Link>
          {" · "}
          <Link to={`/classroom/${room.id}`}>입장 화면</Link>
        </nav>
        <div className="admin-layout__title-row">
          <h1>{room.title}</h1>
          <span className="ui-ko">강의실 허브 — 소개·자료·영상·질의응답</span>
        </div>
        <p className="classroom-page__lede">
          <span className="ui-en" style={{ display: "block", marginBottom: "0.35rem" }}>
            Tabs organize lecture intro, file/video registration (linked to library review policy), and the Q&amp;A board.
          </span>
          <span className="ui-ko">
            탭으로 강의 소개·자료·영상·질의응답을 나눕니다. 자료·영상 <strong>신청</strong>은 관리자 검수 후 라이브러리에
            반영됩니다.
          </span>
        </p>

        <div className="classroom-hub__tabs" role="tablist" aria-label="강의실 관리 구역">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`classroom-hub__tab ${tab === t.id ? "classroom-hub__tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span className="classroom-hub__tab-label">{t.label}</span>
              <span className="classroom-hub__tab-sub">{t.sub}</span>
            </button>
          ))}
        </div>

        <div className="classroom-hub__panel">
          {tab === "intro" && (
            <section className="classroom-hub__section" aria-labelledby="hub-intro-h">
              <h2 id="hub-intro-h" className="classroom-hub__section-title">
                강의 소개 편집
              </h2>
              <p className="classroom-hub__hint">
                학습자 입장 화면 상단에 표시됩니다. <strong>요약</strong>은 짧은 한 줄, <strong>강의 소개</strong>는 목표·주차
                안내 등을 자유롭게 작성하세요.
              </p>
              {room.knowledgeMaterialId ? (
                <p className="classroom-hub__hint" style={{ borderLeft: "3px solid #2563eb", paddingLeft: "0.65rem" }}>
                  <span className="ui-ko">
                    개설 시 <strong>지식 큐레이션</strong> 학습자료가 본문에 합쳐졌습니다. 참조 ID:{" "}
                    <code style={{ fontSize: "0.85em" }}>{room.knowledgeMaterialId}</code>
                  </span>
                </p>
              ) : null}
              <form className="classroom-hub__form" onSubmit={(e) => void saveIntro(e)}>
                <label className="auth-field">
                  <span className="classroom-hub__field-label">강의실 이름</span>
                  <input
                    className="add-passage__control"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    required
                  />
                </label>
                <label className="auth-field">
                  <span className="classroom-hub__field-label">요약 (한 줄)</span>
                  <input
                    className="add-passage__control"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="예: 고2 통합수학 A반 · 2026 봄"
                  />
                </label>
                <label className="auth-field">
                  <span className="classroom-hub__field-label">강의 유형 (수강 신청)</span>
                  <select
                    className="add-passage__control"
                    value={pricingType}
                    onChange={(e) => setPricingType(e.target.value === "paid" ? "paid" : "free")}
                  >
                    <option value="free">무료 — 학생이 전체 강의실에서 바로 수강(멤버 등록)</option>
                    <option value="paid">유료 — 수강 신청 후 연락처 접수 · 강사 승인 (PG 결제 전)</option>
                  </select>
                </label>
                <div className="auth-field classroom-hub__field classroom-hub__field--intro">
                  <span className="classroom-hub__field-label">강의 소개</span>
                  <span className="classroom-hub__field-hint">
                    굵게·링크·이미지 등 서식을 쓸 수 있습니다. 입장 화면에 동일하게 표시됩니다.
                  </span>
                  <RichTextEditor
                    value={introduction}
                    onChange={setIntroduction}
                    placeholder="수업 목표, 주차별 안내, 과제·시험 정책 등을 적어 주세요."
                    userId={firebaseUser?.uid}
                  />
                </div>
                <p className="classroom-hub__preview-label">미리보기 (입장 화면과 동일)</p>
                <div className="classroom-hub__preview">
                  {(() => {
                    const body = getClassroomIntroBody({
                      ...room,
                      title,
                      description,
                      introduction,
                    });
                    return body ? <RichHtmlView html={body} /> : "소개 글이 비어 있으면 요약만 표시됩니다.";
                  })()}
                </div>
                <div className="add-passage__actions">
                  <button type="submit" className="btn btn--primary btn--stack" disabled={savingIntro}>
                    {savingIntro ? "저장 중…" : "저장"}
                  </button>
                </div>
                <div
                  ref={introFeedbackRef}
                  className="classroom-hub__save-feedback"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {introErr ? <p className="classroom-hub__save-feedback--err">{introErr}</p> : null}
                  {introSaveOk && !introErr ? (
                    <p className="classroom-hub__save-feedback--ok">{introSaveOk}</p>
                  ) : null}
                </div>
              </form>
            </section>
          )}

          {tab === "materials" && (
            <section className="classroom-hub__section" aria-labelledby="hub-mat-h">
              <h2 id="hub-mat-h" className="classroom-hub__section-title">
                강의 자료 업로드
              </h2>
              <p className="classroom-hub__hint">
                학습·참고 자료 파일을 올리고 관리자 검수를 거쳐 라이브러리에 반영합니다. 아래 버튼으로 신청 폼으로
                이동합니다.
              </p>
              <div className="classroom-hub__cta-row">
                <Link to={q("/material/register")} className="btn btn--primary btn--stack">
                  자료 등록 신청 열기
                </Link>
                <Link to={q("/teacher/homework/new")} className="btn btn--ghost btn--stack">
                  과제 출제 (강의실 연동)
                </Link>
              </div>
              <h3 className="classroom-hub__subhead">이 강의실로 접수된 자료 신청</h3>
              {listsLoading ? (
                <p className="classroom-hub__hint">목록 불러오는 중…</p>
              ) : materialRows.length === 0 ? (
                <p className="classroom-hub__hint">아직 접수된 자료 신청이 없습니다.</p>
              ) : (
                <ul className="classroom-hub__request-list">
                  {materialRows.map((r) => (
                    <li key={r.id} className="classroom-hub__request-item">
                      <div>
                        <strong>{r.data.title}</strong>
                        <span className="classroom-hub__request-meta">
                          {r.data.status === "pending" && "검수 대기"}
                          {r.data.status === "approved" && "승인됨"}
                          {r.data.status === "rejected" && "반려"}
                          {" · "}
                          {tsLabel(r.data.createdAt)}
                        </span>
                      </div>
                      <p className="classroom-hub__request-desc">
                        {r.data.description.length > 180
                          ? `${r.data.description.slice(0, 180)}…`
                          : r.data.description}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "video" && (
            <section className="classroom-hub__section" aria-labelledby="hub-vid-h">
              <h2 id="hub-vid-h" className="classroom-hub__section-title">
                강의 영상 등록
              </h2>
              <p className="classroom-hub__hint">
                YouTube·Vimeo 등 공개 재생 URL을 제출합니다. 검수 후 콘텐츠로 연결됩니다.
              </p>
              <div className="classroom-hub__cta-row">
                <Link to={q("/video/register")} className="btn btn--primary btn--stack">
                  동영상 강의 등록 신청 열기
                </Link>
              </div>
              <h3 className="classroom-hub__subhead">이 강의실로 접수된 영상 신청</h3>
              {listsLoading ? (
                <p className="classroom-hub__hint">목록 불러오는 중…</p>
              ) : videoRows.length === 0 ? (
                <p className="classroom-hub__hint">아직 접수된 영상 신청이 없습니다.</p>
              ) : (
                <ul className="classroom-hub__request-list">
                  {videoRows.map((r) => (
                    <li key={r.id} className="classroom-hub__request-item">
                      <div>
                        <strong>{r.data.title}</strong>
                        <span className="classroom-hub__request-meta">
                          {r.data.status === "pending" && "검수 대기"}
                          {r.data.status === "approved" && "승인됨"}
                          {r.data.status === "rejected" && "반려"}
                          {" · "}
                          {tsLabel(r.data.createdAt)}
                        </span>
                      </div>
                      <div className="classroom-hub__request-desc">
                        {collectVideoUrlsFromRequest(r.data).map((u, vi) => (
                          <p key={`${r.id}-v-${vi}`} style={{ wordBreak: "break-all", margin: "0.2rem 0 0" }}>
                            {u}
                          </p>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "qa" && id && (
            <section className="classroom-hub__section" aria-labelledby="hub-qa-h">
              <h2 id="hub-qa-h" className="classroom-hub__section-title">
                질의응답 게시판
              </h2>
              <p className="classroom-hub__hint">학습자와 소통합니다. 부적절한 글은 삭제할 수 있습니다.</p>
              <ClassroomQaBoard classroomId={id} isClassroomTeacher />
            </section>
          )}

          {tab === "enrollment" && id && (
            <section className="classroom-hub__section" aria-labelledby="hub-enroll-h">
              <h2 id="hub-enroll-h" className="classroom-hub__section-title">
                유료 수강 신청 대기
              </h2>
              <p className="classroom-hub__hint">
                학생이 <strong>수강신청요청</strong>으로 남긴 연락처입니다. <strong>승인</strong> 시 멤버 UID에 자동
                반영되며, <strong>반려</strong> 시 학생이 다시 신청할 수 있습니다. 무료 강의는 전체 강의실에서 학생이
                직접 수강합니다.
              </p>
              {enrollmentActionErr ? <p className="auth-error">{enrollmentActionErr}</p> : null}
              {enrollmentLoading ? (
                <p className="classroom-hub__hint">목록 불러오는 중…</p>
              ) : enrollmentRows.length === 0 ? (
                <p className="classroom-hub__hint">접수된 수강 신청이 없습니다.</p>
              ) : (
                <ul className="classroom-hub__request-list">
                  {enrollmentRows.map((row) => {
                    const st = row.data.status;
                    const label =
                      st === "pending" ? "수강 대기" : st === "approved" ? "승인됨" : "반려";
                    return (
                      <li key={row.id} className="classroom-hub__request-item">
                        <div>
                          <strong>학생 UID {row.data.studentId}</strong>
                          <span className="classroom-hub__request-meta">
                            {label}
                            {" · "}
                            {tsLabel(row.data.createdAt)}
                          </span>
                        </div>
                        <p className="classroom-hub__request-desc">
                          전화 {row.data.phone} · 이메일 {row.data.email}
                        </p>
                        {st === "pending" ? (
                          <div className="classroom-hub__cta-row" style={{ marginTop: "0.5rem" }}>
                            <button
                              type="button"
                              className="btn btn--primary btn--stack"
                              disabled={enrollmentBusyId === row.id}
                              onClick={() => void approveEnrollment(row.id)}
                            >
                              {enrollmentBusyId === row.id ? "처리 중…" : "승인 (멤버 등록)"}
                            </button>
                            <button
                              type="button"
                              className="btn btn--ghost btn--stack"
                              disabled={enrollmentBusyId === row.id}
                              onClick={() => void rejectEnrollment(row.id)}
                            >
                              반려
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {tab === "members" && id && (
            <section className="classroom-hub__section" aria-labelledby="hub-mem-h">
              <h2 id="hub-mem-h" className="classroom-hub__section-title">
                학습지 배포용 멤버 UID
              </h2>
              <p className="classroom-hub__hint">
                각 학생의 <strong>Firebase 로그인 UID</strong>를 한 줄에 하나씩 저장해 두면, 학습지 배포 화면에서 이
                강의실을 고르고 한 번에 대상 목록에 넣을 수 있습니다. (최대 120명)
              </p>
              {membersErr ? <p className="auth-error">{membersErr}</p> : null}
              <form className="classroom-hub__form" onSubmit={(e) => void saveMembers(e)}>
                <label className="auth-field">
                  <span className="classroom-hub__field-label">학생 UID (줄바꿈·쉼표 구분)</span>
                  <textarea
                    className="classroom-hub__intro-textarea"
                    rows={10}
                    value={memberIdsText}
                    onChange={(e) => setMemberIdsText(e.target.value)}
                    placeholder="학생 계정의 Auth UID"
                  />
                </label>
                <div className="add-passage__actions" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                  <button type="submit" className="btn btn--primary btn--stack" disabled={savingMembers}>
                    {savingMembers ? "저장 중…" : "멤버 목록 저장"}
                  </button>
                  <Link
                    to={`/teacher/assignments/new?classroomId=${encodeURIComponent(id)}`}
                    className="btn btn--ghost btn--stack"
                  >
                    <span className="ui-ko">학습지 배포 화면 열기</span>
                  </Link>
                </div>
              </form>
            </section>
          )}
        </div>
      </main>
    </DashboardShell>
  );
}

export function ClassroomManagePage() {
  return (
    <TeacherRoute>
      <Inner />
    </TeacherRoute>
  );
}
