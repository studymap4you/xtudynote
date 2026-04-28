import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { ClassroomNoticePopup } from "@/components/classroom/ClassroomNoticePopup";
import { ClassroomQaBoard } from "@/components/classroom/ClassroomQaBoard";
import { DashboardShell } from "@/components/DashboardShell";
import { RichHtmlView } from "@/components/RichHtmlView";
import { db } from "@/firebase/config";
import { getClassroomIntroBody } from "@/lib/classroomDisplay";
import type { ClassroomDocument, ClassroomNoticeDocument } from "@/types/classroom";
import type { ClassroomExamAssignmentDocument } from "@/types/classroomExamAssignment";
import type { ContentDocument, ContentStatus, ContentType } from "@/types/content";
import "@/pages/pages.css";

type ContentRow = { id: string; data: ContentDocument };
type TabId = "intro" | "todayExam" | "materials" | "video" | "qa";

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
  if (raw && typeof raw === "object" && "toMillis" in raw && typeof (raw as { toMillis: () => number }).toMillis === "function") {
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
  const { firebaseUser, isTeacherApproved, isSuperAdmin } = useAuth();
  const [room, setRoom] = useState<(ClassroomDocument & { id: string }) | null>(null);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [contentsErr, setContentsErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("intro");
  const [noticeRows, setNoticeRows] = useState<{ id: string; data: ClassroomNoticeDocument }[]>([]);
  const [noticePopupOpen, setNoticePopupOpen] = useState(true);
  const [examAssignments, setExamAssignments] = useState<
    { id: string; data: ClassroomExamAssignmentDocument }[]
  >([]);
  const [examAssignmentsErr, setExamAssignmentsErr] = useState<string | null>(null);

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
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      setContentsErr(null);
      try {
        const rs = await getDoc(doc(db, "classrooms", id));
        if (!rs.exists()) {
          if (!cancelled) {
            setErr("강의실을 찾을 수 없습니다.");
            setRoom(null);
            setLoading(false);
          }
          return;
        }
        const rdata = rs.data() as ClassroomDocument;
        if (!cancelled) setRoom({ id: rs.id, ...rdata });
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "강의실을 불러오지 못했습니다.");
          setRoom(null);
        }
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const cq = query(collection(db, "contents"), where("classroomId", "==", id));
        const cs = await getDocs(cq);
        const list: ContentRow[] = [];
        cs.forEach((d) => list.push({ id: d.id, data: d.data() as ContentDocument }));
        list.sort((a, b) => {
          const ta = a.data.createdAt as { toMillis?: () => number } | undefined;
          const tb = b.data.createdAt as { toMillis?: () => number } | undefined;
          return (tb?.toMillis?.() ?? 0) - (ta?.toMillis?.() ?? 0);
        });
        if (!cancelled) setContents(list);
      } catch (e) {
        if (!cancelled) {
          setContents([]);
          setContentsErr(e instanceof Error ? e.message : "학습 자료 목록을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    setNoticePopupOpen(true);
    setNoticeRows([]);
  }, [id]);

  useEffect(() => {
    if (!id || loading || !canAccessRoom) {
      if (!loading) {
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
        setExamAssignmentsErr(e instanceof Error ? e.message : "학습문제 목록을 불러오지 못했습니다.");
      },
    );
    return () => unsub();
  }, [id, loading, canAccessRoom]);

  useEffect(() => {
    if (!id || loading || !canAccessRoom || !firebaseUser) {
      if (!loading) setNoticeRows([]);
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
  }, [id, loading, canAccessRoom, firebaseUser]);

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

  const tabs: { id: TabId; label: string; sub: string }[] = [
    { id: "intro", label: "강의 소개", sub: "목표·안내" },
    { id: "todayExam", label: "오늘의 학습문제", sub: "AI·자동채점" },
    { id: "materials", label: "학습 자료", sub: "파일·문서" },
    { id: "video", label: "강의 영상", sub: "링크" },
    { id: "qa", label: "질의응답", sub: "게시판" },
  ];

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
              이 강의실은 개설 선생님 또는 멤버로 등록된 학습자만 열람할 수 있습니다. 다른 계정으로 수강 신청만 한 경우,
              그 계정으로 로그인했는지 확인해 주세요. 멤버 등록이 필요하면{" "}
              <Link to="/classrooms">전체 강의실</Link>에서 강사에게 요청하거나{" "}
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
                  {isOwner ? (
                    <Link
                      to={`/classroom/${room.id}/manage`}
                      className="btn btn--primary classroom-room-hero__manage"
                    >
                      강의실 관리
                    </Link>
                  ) : null}
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

              <div className="classroom-room-nav classroom-hub__tabs" role="tablist" aria-label="강의실 보기">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    className={`classroom-hub__tab classroom-room-nav__card classroom-room-nav__card--${t.id} ${
                      tab === t.id ? "classroom-hub__tab--active" : ""
                    }`}
                    onClick={() => setTab(t.id)}
                  >
                    <span className={`classroom-room-nav__icon classroom-room-nav__icon--${t.id}`} aria-hidden />
                    <span className="classroom-room-nav__text">
                      <span className="classroom-hub__tab-label">{t.label}</span>
                      <span className="classroom-hub__tab-sub">{t.sub}</span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="classroom-hub__panel classroom-room-panel">
                {tab === "todayExam" && (
                  <section className="classroom-hub__section classroom-room-section">
                    <div className="classroom-room-section__intro">
                      <h2 className="classroom-hub__section-title classroom-room-section__title">오늘의 학습문제</h2>
                      <p className="classroom-room-section__desc">
                        선생님이 이 강의실에 배포한 AI 문제를 풀고 제출하면 자동 채점됩니다.
                      </p>
                    </div>
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

                {tab === "intro" && (
                  <section className="classroom-hub__section classroom-room-section">
                    <div className="classroom-room-section__intro">
                      <h2 className="classroom-hub__section-title classroom-room-section__title">강의 소개</h2>
                      <p className="classroom-room-section__desc">커리큘럼과 목표를 확인하세요.</p>
                    </div>
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

                {tab === "materials" && (
                  <section className="classroom-hub__section classroom-room-section">
                    <div className="classroom-room-section__intro">
                      <h2 className="classroom-hub__section-title classroom-room-section__title">학습 자료</h2>
                      <p className="classroom-room-section__desc">파일·문서 자료를 카드에서 선택해 열 수 있습니다.</p>
                    </div>
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

                {tab === "video" && (
                  <section className="classroom-hub__section classroom-room-section">
                    <div className="classroom-room-section__intro">
                      <h2 className="classroom-hub__section-title classroom-room-section__title">강의 영상</h2>
                      <p className="classroom-room-section__desc">등록된 영상 링크로 이동합니다.</p>
                    </div>
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

                {tab === "qa" && id && (
                  <section className="classroom-hub__section classroom-room-section">
                    <div className="classroom-room-section__intro">
                      <h2 className="classroom-hub__section-title classroom-room-section__title">질의응답</h2>
                      <p className="classroom-room-section__desc">강의 내용을 묻고 답을 나누는 공간입니다.</p>
                    </div>
                    <div className="classroom-room-qa">
                      <ClassroomQaBoard classroomId={id} isClassroomTeacher={isOwner} />
                    </div>
                  </section>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </DashboardShell>
  );
}
