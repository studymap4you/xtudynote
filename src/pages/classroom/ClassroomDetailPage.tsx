import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { ClassroomQaBoard } from "@/components/classroom/ClassroomQaBoard";
import { DashboardShell } from "@/components/DashboardShell";
import { RichHtmlView } from "@/components/RichHtmlView";
import { db } from "@/firebase/config";
import { getClassroomIntroBody } from "@/lib/classroomDisplay";
import type { ClassroomDocument } from "@/types/classroom";
import type { ContentDocument, ContentStatus, ContentType } from "@/types/content";
import "@/pages/pages.css";

type ContentRow = { id: string; data: ContentDocument };
type TabId = "intro" | "materials" | "video" | "qa";

function labelType(t: ContentType | undefined): string {
  if (t === "paid") return "유료";
  if (t === "homework") return "과제";
  return "공유";
}

function hasVideoLink(c: ContentDocument): boolean {
  const u = c.lectureLink?.trim();
  return !!u;
}

export function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { firebaseUser, isTeacherApproved, isSuperAdmin } = useAuth();
  const [room, setRoom] = useState<(ClassroomDocument & { id: string }) | null>(null);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("intro");

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
      try {
        const rs = await getDoc(doc(db, "classrooms", id));
        if (!rs.exists()) {
          if (!cancelled) setErr("강의실을 찾을 수 없습니다.");
          setRoom(null);
          return;
        }
        const rdata = rs.data() as ClassroomDocument;
        if (!cancelled) setRoom({ id: rs.id, ...rdata });

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
        if (!cancelled) setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

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
    { id: "materials", label: "학습 자료", sub: "파일·문서" },
    { id: "video", label: "강의 영상", sub: "링크" },
    { id: "qa", label: "질의응답", sub: "게시판" },
  ];

  function renderMaterialRow(c: ContentRow) {
    const t = (c.data.type ?? "share") as ContentType;
    const st = (c.data.status ?? "pending") as ContentStatus;
    const isPaid = t === "paid";
    return (
      <li key={c.id} className="classroom-page__material">
        <div>
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
        <div>
          {st === "approved" ? (
            <Link to={`/content/${c.id}`} className="btn btn--ghost btn--stack">
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
        <nav className="classroom-page__breadcrumb">
          <Link to="/classroom">← 강의실 목록</Link>
        </nav>
        {err && <p className="auth-error">{err}</p>}
        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p className="ui-ko">불러오는 중…</p>
          </div>
        ) : !room ? null : !canAccessRoom ? (
          <div className="admin-layout__title-row">
            <h1>입장 불가</h1>
            <p className="classroom-page__lede">
              이 강의실은 멤버로 등록된 학습자만 열람할 수 있습니다. 선생님께 멤버 등록을 요청하거나{" "}
              <Link to="/classroom">내 강의실 목록</Link>으로 돌아가 주세요.
            </p>
          </div>
        ) : (
          <>
            <div className="admin-layout__title-row">
              <h1>{room.title}</h1>
              <span className="ui-ko">강의실</span>
            </div>

            {isOwner && (
              <p style={{ marginBottom: "var(--space-2)" }}>
                <Link to={`/classroom/${room.id}/manage`} className="btn btn--primary btn--stack">
                  강의실 관리 (소개·자료·영상·질의응답)
                </Link>
              </p>
            )}

            <div className="classroom-hub__tabs" role="tablist" aria-label="강의실 보기">
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
                <section className="classroom-hub__section">
                  <h2 className="classroom-hub__section-title">강의 소개</h2>
                  {introBody ? (
                    <div className="classroom-hub__intro-body">
                      <RichHtmlView html={introBody} />
                    </div>
                  ) : (
                    <p style={{ color: "var(--light-text-muted, #6b7280)" }}>
                      등록된 강의 소개가 없습니다. 선생님이 관리 화면에서 작성할 수 있습니다.
                    </p>
                  )}
                </section>
              )}

              {tab === "materials" && (
                <section className="classroom-hub__section">
                  <h2 className="classroom-hub__section-title">학습 자료</h2>
                  {fileItems.length === 0 ? (
                    <p style={{ color: "var(--light-text-muted, #6b7280)" }}>
                      아직 표시할 자료가 없습니다. (승인 대기 중이거나 등록 전일 수 있습니다.)
                    </p>
                  ) : (
                    <ul className="classroom-page__materials">{fileItems.map(renderMaterialRow)}</ul>
                  )}
                </section>
              )}

              {tab === "video" && (
                <section className="classroom-hub__section">
                  <h2 className="classroom-hub__section-title">강의 영상</h2>
                  {videoItems.length === 0 ? (
                    <p style={{ color: "var(--light-text-muted, #6b7280)" }}>
                      등록된 강의 영상(링크)이 없습니다.
                    </p>
                  ) : (
                    <ul className="classroom-page__materials">{videoItems.map(renderMaterialRow)}</ul>
                  )}
                </section>
              )}

              {tab === "qa" && id && (
                <section className="classroom-hub__section">
                  <h2 className="classroom-hub__section-title">질의응답</h2>
                  <ClassroomQaBoard classroomId={id} isClassroomTeacher={isOwner} />
                </section>
              )}
            </div>
          </>
        )}
      </main>
    </DashboardShell>
  );
}
