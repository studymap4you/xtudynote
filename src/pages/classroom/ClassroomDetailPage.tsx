import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { ClassroomNoticePopup } from "@/components/classroom/ClassroomNoticePopup";
import { ClassroomQaBoard } from "@/components/classroom/ClassroomQaBoard";
import { ClassroomLessonCurriculumStudent } from "@/components/classroom/ClassroomLessonCurriculumStudent";
import { ClassroomSectionModal } from "@/components/classroom/ClassroomSectionModal";
import { DashboardShell } from "@/components/DashboardShell";
import { RichHtmlView } from "@/components/RichHtmlView";
import { db } from "@/firebase/config";
import { getClassroomIntroBody } from "@/lib/classroomDisplay";
import { isHttpUrl, normalizeExternalUrl } from "@/lib/isHttpUrl";
import type { ClassroomDocument, ClassroomNoticeDocument } from "@/types/classroom";
import type { ClassroomLessonDocument } from "@/types/classroomLesson";
import type { ClassroomExamAssignmentDocument } from "@/types/classroomExamAssignment";
import type { ContentDocument, ContentStatus, ContentType } from "@/types/content";
import "@/pages/pages.css";

type ContentRow = { id: string; data: ContentDocument };
type TabId = "intro" | "todayExam" | "materials" | "video" | "qa";

type CurriculumRow = {
  kind: "content" | "exam";
  id: string;
  sectionLabel: string | null;
  title: string;
  detail: string;
  badge: string;
  badgeVariant: "file" | "video" | "exam";
  href: string;
  createdAtMs: number;
};

function createdAtMs(raw: unknown): number {
  if (
    raw &&
    typeof raw === "object" &&
    "toMillis" in raw &&
    typeof (raw as { toMillis: () => number }).toMillis === "function"
  ) {
    try {
      return (raw as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  return 0;
}

function labelType(t: ContentType | undefined): string {
  if (t === "paid") return "유료";
  if (t === "homework") return "과제";
  return "공유";
}

function hasVideoLink(c: ContentDocument): boolean {
  const u = c.lectureLink?.trim();
  return !!u;
}

function noticeTsLabel(raw: unknown): string {
  if (
    raw &&
    typeof raw === "object" &&
    "toMillis" in raw &&
    typeof (raw as { toMillis: () => number }).toMillis === "function"
  ) {
    try {
      return new Date((raw as { toMillis: () => number }).toMillis()).toLocaleString();
    } catch {
      return "";
    }
  }
  return "";
}

export function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { firebaseUser, isTeacherApproved, isSuperAdmin, profile } = useAuth();
  const [room, setRoom] = useState<(ClassroomDocument & { id: string }) | null>(null);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [roomLoading, setRoomLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [contentsErr, setContentsErr] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<TabId | null>(null);
  const [noticeRows, setNoticeRows] = useState<{ id: string; data: ClassroomNoticeDocument }[]>([]);
  const [noticePopupOpen, setNoticePopupOpen] = useState(true);
  const [examAssignments, setExamAssignments] = useState<
    { id: string; data: ClassroomExamAssignmentDocument }[]
  >([]);
  const [examAssignmentsErr, setExamAssignmentsErr] = useState<string | null>(null);
  const [lessonRows, setLessonRows] = useState<{ id: string; data: ClassroomLessonDocument }[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [togglingLessonId, setTogglingLessonId] = useState<string | null>(null);

  const isOwner = useMemo(
    () => !!(room && firebaseUser && room.teacherId === firebaseUser.uid),
    [room, firebaseUser],
  );

  const canAccessRoom = useMemo(() => {
    if (!room || !firebaseUser) return false;
    if (isSuperAdmin) return true;
    if (room.teacherId === firebaseUser.uid) return true;
    const ids = room.memberStudentIds ?? [];
    return ids.includes(firebaseUser.uid);
  }, [room, firebaseUser, isSuperAdmin]);

  useEffect(() => {
    if (!id) return;
    setRoomLoading(true);
    setErr(null);
    const unsub = onSnapshot(
      doc(db, "classrooms", id),
      (snap) => {
        if (!snap.exists()) {
          setErr("강의실을 찾을 수 없습니다.");
          setRoom(null);
        } else {
          setRoom({ id: snap.id, ...(snap.data() as ClassroomDocument) });
          setErr(null);
        }
        setRoomLoading(false);
      },
      (e) => {
        setErr(e instanceof Error ? e.message : "강의실을 불러오지 못했습니다.");
        setRoom(null);
        setRoomLoading(false);
      },
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setContentsErr(null);
    const cq = query(collection(db, "contents"), where("classroomId", "==", id));
    const unsub = onSnapshot(
      cq,
      (snap) => {
        const list: ContentRow[] = [];
        snap.forEach((d) => list.push({ id: d.id, data: d.data() as ContentDocument }));
        setContents(list);
        setContentsErr(null);
      },
      (e) => {
        setContents([]);
        setContentsErr(e instanceof Error ? e.message : "학습 자료 목록을 불러오지 못했습니다.");
      },
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    setNoticePopupOpen(true);
    setNoticeRows([]);
  }, [id]);

  useEffect(() => {
    if (!id || roomLoading || !canAccessRoom) {
      if (!roomLoading) {
        setExamAssignments([]);
        setExamAssignmentsErr(null);
      }
      return;
    }

    setExamAssignmentsErr(null);
    const aq = query(
      collection(db, "classroom_exam_assignments"),
      where("classroomId", "==", id),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      aq,
      (snap) => {
        const list: { id: string; data: ClassroomExamAssignmentDocument }[] = [];
        snap.forEach((d) => list.push({ id: d.id, data: d.data() as ClassroomExamAssignmentDocument }));
        setExamAssignments(list);
        setExamAssignmentsErr(null);
      },
      (e) => {
        setExamAssignments([]);
        setExamAssignmentsErr(
          e instanceof Error ? e.message : "학습문제 목록을 불러오지 못했습니다.",
        );
      },
    );
    return () => unsub();
  }, [id, roomLoading, canAccessRoom]);

  useEffect(() => {
    if (!id || roomLoading || !canAccessRoom || !firebaseUser) {
      if (!roomLoading) setNoticeRows([]);
      return;
    }

    const nq = query(collection(db, "classrooms", id, "notices"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      nq,
      (snap) => {
        const list: { id: string; data: ClassroomNoticeDocument }[] = [];
        snap.forEach((d) => list.push({ id: d.id, data: d.data() as ClassroomNoticeDocument }));
        setNoticeRows(list);
      },
      () => setNoticeRows([]),
    );
    return () => unsub();
  }, [id, roomLoading, canAccessRoom, firebaseUser]);

  useEffect(() => {
    if (!id || roomLoading || !canAccessRoom) {
      setLessonRows([]);
      return;
    }
    const lq = query(collection(db, "classrooms", id, "lessons"), orderBy("orderIndex", "asc"));
    const unsub = onSnapshot(
      lq,
      (snap) => {
        const list: { id: string; data: ClassroomLessonDocument }[] = [];
        snap.forEach((d) => list.push({ id: d.id, data: d.data() as ClassroomLessonDocument }));
        setLessonRows(list);
      },
      () => setLessonRows([]),
    );
    return () => unsub();
  }, [id, roomLoading, canAccessRoom]);

  useEffect(() => {
    if (!id || !firebaseUser || roomLoading || !canAccessRoom) {
      setCompletedLessonIds([]);
      return;
    }
    const pref = doc(db, "classrooms", id, "student_lesson_progress", firebaseUser.uid);
    const unsub = onSnapshot(
      pref,
      (snap) => {
        if (!snap.exists()) {
          setCompletedLessonIds([]);
          return;
        }
        const raw = snap.data().completedLessonIds;
        setCompletedLessonIds(Array.isArray(raw) ? raw.map(String) : []);
      },
      () => setCompletedLessonIds([]),
    );
    return () => unsub();
  }, [id, firebaseUser, roomLoading, canAccessRoom]);

  const visibleContents = useMemo(() => {
    const showAll = isOwner && isTeacherApproved;
    return contents.filter((c) => {
      const st = (c.data.status ?? "approved") as ContentStatus;
      if (showAll) return true;
      return st === "approved";
    });
  }, [contents, isOwner, isTeacherApproved]);

  const videoItems = useMemo(() => visibleContents.filter((c) => hasVideoLink(c.data)), [visibleContents]);
  const fileItems = useMemo(() => visibleContents.filter((c) => !hasVideoLink(c.data)), [visibleContents]);

  const introBody = room ? getClassroomIntroBody(room) : "";

  const studentChatHref = useMemo(() => {
    const u = normalizeExternalUrl(room?.studentChatUrl);
    return u && isHttpUrl(u) ? u : "";
  }, [room?.studentChatUrl]);

  /** 링크가 있으면 학생·개설자 모두 같은 「1:1 채팅」 진입 버튼을 봅니다. */
  const showOneToOneChatBtn = !!studentChatHref;
  const showOwnerChatLinkEditor = isOwner;
  const ownerChatEditorLabel = studentChatHref ? "채팅 링크 수정" : "오픈채팅 연결";

  const showNonOwnerTeacherHint =
    !!profile &&
    profile.role === "teacher" &&
    profile.accountStatus === "active" &&
    canAccessRoom &&
    !isOwner &&
    !!room;
  const showStudentNoChatHint =
    !!profile &&
    profile.role === "student" &&
    profile.accountStatus === "active" &&
    canAccessRoom &&
    !isOwner &&
    !studentChatHref &&
    !!room;

  const tabs: { id: TabId; label: string; sub: string }[] = [
    { id: "intro", label: "강의 소개", sub: "목표·안내" },
    { id: "todayExam", label: "오늘의 학습문제", sub: "AI·자동채점" },
    { id: "materials", label: "학습 자료", sub: "파일·문서" },
    { id: "video", label: "강의 영상", sub: "링크" },
    { id: "qa", label: "질의응답", sub: "게시판" },
  ];

  const activeTabInfo = openModal ? tabs.find((t) => t.id === openModal) ?? null : null;

  const curriculumRows = useMemo((): CurriculumRow[] => {
    if (!id) return [];
    const rows: CurriculumRow[] = [];

    for (const c of visibleContents) {
      const sectionRaw = (c.data.section ?? "").trim();
      const isVideo = hasVideoLink(c.data);
      rows.push({
        kind: "content",
        id: c.id,
        sectionLabel: sectionRaw || null,
        title: c.data.subject?.trim() || "학습 콘텐츠",
        detail: c.data.learningTopic?.trim() ?? "",
        badge: isVideo ? "강의 영상" : "학습 자료",
        badgeVariant: isVideo ? "video" : "file",
        href: `/content/${c.id}`,
        createdAtMs: createdAtMs(c.data.createdAt),
      });
    }

    for (const row of examAssignments) {
      rows.push({
        kind: "exam",
        id: row.id,
        sectionLabel: null,
        title: row.data.title?.trim() || "학습문제",
        detail: row.data.subject?.trim() ?? "",
        badge: "학습문제",
        badgeVariant: "exam",
        href: `/classroom/${id}/learn/${row.id}`,
        createdAtMs: createdAtMs(row.data.createdAt),
      });
    }

    return rows.sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
  }, [visibleContents, examAssignments, id]);

  function renderMaterialRow(c: ContentRow) {
    const t = (c.data.type ?? "share") as ContentType;
    const st = (c.data.status ?? "pending") as ContentStatus;
    const isPaid = t === "paid";
    return (
      <li key={c.id} className="classroom-page__material classroom-room-content-card">
        <div className="classroom-room-content-card__body">
          <span className="classroom-page__badge">{labelType(t)}</span>
          {st !== "approved" && (
            <span className="classroom-page__badge classroom-page__badge--muted">
              {st === "pending" ? "검수 대기" : "반려"}
            </span>
          )}
          <h3 className="classroom-page__material-title">{c.data.subject}</h3>
          <p className="classroom-page__material-topic">{c.data.learningTopic}</p>
          {isPaid && (
            <p className="classroom-page__paid-note">유료 자료입니다. 상세에서 결제·구매 안내를 확인하세요.</p>
          )}
        </div>
        <div className="classroom-room-content-card__action">
          {st === "approved" ? (
            <Link to={`/content/${c.id}`} className="btn btn--primary btn--stack classroom-room-content-card__btn">
              열기
            </Link>
          ) : (
            <span className="classroom-page__lock">승인 후 열람</span>
          )}
        </div>
      </li>
    );
  }

  async function handleLessonCompleteToggle(lessonId: string, completed: boolean) {
    if (!id || !firebaseUser) return;
    const pref = doc(db, "classrooms", id, "student_lesson_progress", firebaseUser.uid);
    setTogglingLessonId(lessonId);
    try {
      if (completed) {
        await setDoc(
          pref,
          { completedLessonIds: arrayUnion(lessonId), updatedAt: serverTimestamp() },
          { merge: true },
        );
      } else {
        const snap = await getDoc(pref);
        if (!snap.exists()) return;
        await updateDoc(pref, {
          completedLessonIds: arrayRemove(lessonId),
          updatedAt: serverTimestamp(),
        });
      }
    } catch {
      /* optimistic UI rolls back via snapshot */
    } finally {
      setTogglingLessonId(null);
    }
  }

  const loading = roomLoading;

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light classroom-hub">
        {!(room && canAccessRoom) ? (
          <nav className="classroom-page__breadcrumb">
            <Link to="/classrooms">← 전체 강의실</Link>
            {" · "}
            <Link to="/classroom">내 강의실</Link>
          </nav>
        ) : null}
        {err && <p className="auth-error">{err}</p>}
        {contentsErr && !err ? <p className="auth-error">{contentsErr}</p> : null}
        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p className="ui-ko">불러오는 중…</p>
          </div>
        ) : !room ? null : !canAccessRoom ? (
          <div className="admin-layout__title-row">
            <h1>입장 불가</h1>
            <p className="classroom-page__lede">
              이 강의실은 개설 선생님 또는 멤버로 등록된 학습자만 열람할 수 있습니다. 전체 강의실에서{" "}
              <strong>수강신청</strong>으로 멤버 등록을 마쳤는지, 같은 계정으로 로그인했는지 확인해 주세요. 아직 멤버가
              아니면{" "}
              <Link to="/classrooms">전체 강의실</Link>에서 수강 신청 후 다시 시도하거나{" "}
              <Link to="/classroom">내 강의실</Link>로 돌아가 주세요.
            </p>
          </div>
        ) : (
          <>
            <ClassroomNoticePopup
              open={noticeRows.length > 0 && noticePopupOpen}
              classroomTitle={room.title}
              rows={noticeRows}
              onClose={() => setNoticePopupOpen(false)}
            />

            {openModal && activeTabInfo ? (
              <ClassroomSectionModal
                open
                title={activeTabInfo.label}
                subtitle={
                  openModal === "intro"
                    ? "커리큘럼과 목표를 확인하세요."
                    : openModal === "todayExam"
                      ? "선생님이 이 강의실에 배포한 AI 문제를 풀고 제출하면 자동 채점됩니다."
                      : openModal === "materials"
                        ? "파일·문서 자료를 카드에서 선택해 열 수 있습니다."
                        : openModal === "video"
                          ? "등록된 영상 링크로 이동합니다."
                          : "강의 내용을 묻고 답을 나누는 공간입니다."
                }
                onClose={() => setOpenModal(null)}
              >
                {openModal === "todayExam" && (
                  <section className="classroom-hub__section classroom-room-section">
                    {examAssignmentsErr ? (
                      <div className="auth-error classroom-room-callout classroom-room-callout--warn" role="alert">
                        <p style={{ margin: 0 }}>{examAssignmentsErr}</p>
                        {examAssignmentsErr.includes("index") || examAssignmentsErr.includes("Index") ? (
                          <p style={{ margin: "0.5rem 0 0" }}>
                            Firestore에 classroom_exam_assignments용 복합 인덱스(classroomId + createdAt) 배포가
                            필요할 수 있습니다.
                          </p>
                        ) : null}
                      </div>
                    ) : examAssignments.length === 0 ? (
                      <div className="classroom-room-empty">
                        <span className="classroom-room-empty__visual" aria-hidden />
                        <p className="classroom-room-empty__text">
                          아직 배포된 학습문제가 없습니다. 선생님이 시험 생성 화면에서 이 강의실을 선택해 배포하면 여기에
                          표시됩니다.
                        </p>
                      </div>
                    ) : (
                      <ul className="classroom-page__materials classroom-room-card-grid">
                        {examAssignments.map((row) => (
                          <li
                            key={row.id}
                            className="classroom-page__material classroom-room-content-card classroom-room-content-card--exam"
                          >
                            <div className="classroom-room-content-card__body">
                              <p className="classroom-room-content-card__kicker">AI 학습문제</p>
                              <h3 className="classroom-page__material-title">{row.data.title}</h3>
                              <p className="classroom-page__material-topic">{row.data.subject}</p>
                            </div>
                            <div className="classroom-room-content-card__action">
                              <Link
                                to={`/classroom/${id}/learn/${row.id}`}
                                className="btn btn--primary btn--stack classroom-room-content-card__btn"
                              >
                                풀기
                              </Link>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                {openModal === "intro" && (
                  <section className="classroom-hub__section classroom-room-section">
                    {introBody ? (
                      <div className="classroom-room-intro-card">
                        <div className="classroom-hub__intro-body classroom-room-intro-card__body">
                          <RichHtmlView html={introBody} />
                        </div>
                      </div>
                    ) : (
                      <div className="classroom-room-empty">
                        <span className="classroom-room-empty__visual" aria-hidden />
                        <p className="classroom-room-empty__text">
                          등록된 강의 소개가 없습니다. 선생님이 관리 화면에서 작성할 수 있습니다.
                        </p>
                      </div>
                    )}
                  </section>
                )}

                {openModal === "materials" && (
                  <section className="classroom-hub__section classroom-room-section">
                    {fileItems.length === 0 ? (
                      <div className="classroom-room-empty">
                        <span className="classroom-room-empty__visual" aria-hidden />
                        <p className="classroom-room-empty__text">
                          아직 표시할 자료가 없습니다. (승인 대기 중이거나 등록 전일 수 있습니다.)
                        </p>
                      </div>
                    ) : (
                      <ul className="classroom-page__materials classroom-room-card-grid">{fileItems.map(renderMaterialRow)}</ul>
                    )}
                  </section>
                )}

                {openModal === "video" && (
                  <section className="classroom-hub__section classroom-room-section">
                    {videoItems.length === 0 ? (
                      <div className="classroom-room-empty">
                        <span className="classroom-room-empty__visual" aria-hidden />
                        <p className="classroom-room-empty__text">등록된 강의 영상(링크)이 없습니다.</p>
                      </div>
                    ) : (
                      <ul className="classroom-page__materials classroom-room-card-grid">{videoItems.map(renderMaterialRow)}</ul>
                    )}
                  </section>
                )}

                {openModal === "qa" && id ? (
                  <section className="classroom-hub__section classroom-room-section">
                    <div className="classroom-room-qa">
                      <ClassroomQaBoard classroomId={id} isClassroomTeacher={isOwner} />
                    </div>
                  </section>
                ) : null}
              </ClassroomSectionModal>
            ) : null}

            <div className="classroom-room-view">
              {noticeRows.length > 0 && !noticePopupOpen ? (
                <section className="classroom-notices-inline classroom-room-view__notices" aria-labelledby="classroom-inline-notices-h">
                  <h2 id="classroom-inline-notices-h" className="classroom-notices-inline__heading">
                    공지사항
                  </h2>
                  <ul className="classroom-notices-inline__list">
                    {noticeRows.map((r) => {
                      const meta = noticeTsLabel(r.data.createdAt);
                      return (
                        <li key={r.id}>
                          <p className="classroom-notices-inline__item">{r.data.body}</p>
                          {meta ? <span className="classroom-notices-inline__meta">{meta}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              <header className="classroom-room-hero">
                <div className="classroom-room-hero__glow" aria-hidden />
                <nav className="classroom-room-hero__breadcrumb classroom-page__breadcrumb">
                  <Link to="/classrooms">← 전체 강의실</Link>
                  {" · "}
                  <Link to="/classroom">내 강의실</Link>
                </nav>
                <div className="classroom-room-hero__head">
                  <div className="classroom-room-hero__titles">
                    <p className="classroom-room-hero__eyebrow">Xtudy 강의실</p>
                    <h1 className="classroom-room-hero__title">{room.title}</h1>
                    {room.description?.trim() ? (
                      <p className="classroom-room-hero__lede">{room.description.trim()}</p>
                    ) : null}
                  </div>
                  <div className="classroom-room-hero__actions">
                    {showOneToOneChatBtn ? (
                      <a
                        href={studentChatHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn--primary classroom-room-hero__manage classroom-room-hero__student-chat"
                      >
                        1:1 채팅
                      </a>
                    ) : null}
                    {showOwnerChatLinkEditor ? (
                      <>
                        <Link
                          to={`/classroom/${room.id}/manage?focus=studentChat`}
                          className="btn btn--ghost classroom-room-hero__manage classroom-room-hero__chat-setup"
                        >
                          {ownerChatEditorLabel}
                        </Link>
                        <Link
                          to={`/classroom/${room.id}/manage`}
                          className="btn btn--primary classroom-room-hero__manage"
                        >
                          강의실 관리
                        </Link>
                      </>
                    ) : null}
                  </div>
                </div>
                <ul className="classroom-room-hero__stats" aria-label="강의실 콘텐츠 요약">
                  <li>
                    <span className="classroom-room-hero__stat-value">{fileItems.length}</span>
                    <span className="classroom-room-hero__stat-label">학습 자료</span>
                  </li>
                  <li>
                    <span className="classroom-room-hero__stat-value">{videoItems.length}</span>
                    <span className="classroom-room-hero__stat-label">강의 영상</span>
                  </li>
                  <li>
                    <span className="classroom-room-hero__stat-value">{examAssignments.length}</span>
                    <span className="classroom-room-hero__stat-label">학습문제</span>
                  </li>
                </ul>
              </header>

              {showNonOwnerTeacherHint ? (
                <div className="classroom-room-context-hint" role="status">
                  <p className="classroom-room-context-hint__text">
                    이 강의실은 <strong>다른 선생님 계정</strong>으로 개설된 클래스입니다.{" "}
                    <strong>오픈채팅·자료 등록</strong>은 개설 선생님이 로그인했을 때만 할 수 있으며, 지금 계정으로는
                    수강생 화면만 보입니다. 직접 만든 강의실은「내 강의실」목록에서 들어가거나, 개설에 쓴 계정으로 로그인해
                    주세요.
                  </p>
                </div>
              ) : null}

              {showStudentNoChatHint ? (
                <div className="classroom-room-context-hint classroom-room-context-hint--muted" role="status">
                  <p className="classroom-room-context-hint__text">
                    선생님이 아직 <strong>채팅 링크</strong>를 연결하지 않았습니다. 필요하면 질의응답 게시판을 이용해 주세요.
                  </p>
                </div>
              ) : null}

              <div className="classroom-room-nav classroom-hub__tabs" role="tablist" aria-label="강의실 보기">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={openModal === t.id}
                    className={`classroom-hub__tab classroom-room-nav__card classroom-room-nav__card--${t.id} ${
                      openModal === t.id ? "classroom-hub__tab--active" : ""
                    }`}
                    onClick={() => setOpenModal((cur) => (cur === t.id ? null : t.id))}
                  >
                    <span className={`classroom-room-nav__icon classroom-room-nav__icon--${t.id}`} aria-hidden />
                    <span className="classroom-room-nav__text">
                      <span className="classroom-hub__tab-label">{t.label}</span>
                      <span className="classroom-hub__tab-sub">{t.sub}</span>
                    </span>
                  </button>
                ))}
              </div>

              <section className="classroom-curriculum" aria-labelledby="classroom-curriculum-h">
                <div className="classroom-curriculum__intro">
                  <h2 id="classroom-curriculum-h" className="classroom-curriculum__heading">
                    강의 목차
                  </h2>
                  <p className="classroom-curriculum__lede">
                    {lessonRows.length > 0 ? (
                      <>
                        선생님이 구성한 <strong>레슨·단원 순서</strong>가 실시간으로 표시됩니다. 제목을 눌러 내용을 펼치고,
                        학습을 마친 레슨은 왼쪽 체크로 표시할 수 있습니다.
                      </>
                    ) : (
                      <>
                        관리 화면에서 레슨을 아직 만들지 않은 경우, 등록된 학습 자료·영상·학습문제가 시간 순으로 함께
                        표시됩니다.
                      </>
                    )}
                  </p>
                </div>
                {lessonRows.length > 0 ? (
                  <ClassroomLessonCurriculumStudent
                    lessons={lessonRows}
                    completedLessonIds={new Set(completedLessonIds)}
                    togglingLessonId={togglingLessonId}
                    onToggleComplete={(lid, done) => void handleLessonCompleteToggle(lid, done)}
                  />
                ) : curriculumRows.length === 0 ? (
                  <p className="classroom-curriculum__empty">아직 등록된 강의 항목이 없습니다.</p>
                ) : (
                  <ul className="classroom-curriculum__list">
                    {curriculumRows.map((row, idx) => (
                      <li key={`${row.kind}-${row.id}`} className="classroom-curriculum__item">
                        <span className="classroom-curriculum__order" aria-hidden>
                          {idx + 1}
                        </span>
                        <div className="classroom-curriculum__main">
                          <div className="classroom-curriculum__badges">
                            <span
                              className={`classroom-curriculum__badge classroom-curriculum__badge--${row.badgeVariant}`}
                            >
                              {row.badge}
                            </span>
                          </div>
                          {row.sectionLabel ? (
                            <p className="classroom-curriculum__section-label">단원 · {row.sectionLabel}</p>
                          ) : null}
                          <h3 className="classroom-curriculum__title">{row.title}</h3>
                          {row.detail ? <p className="classroom-curriculum__detail">{row.detail}</p> : null}
                        </div>
                        <div className="classroom-curriculum__action">
                          <Link to={row.href} className="btn btn--primary btn--stack">
                            {row.kind === "exam" ? "풀기" : "열기"}
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </DashboardShell>
  );
}
