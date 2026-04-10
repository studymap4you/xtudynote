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
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import type { ClassroomDocument } from "@/types/classroom";
import type { ContentDocument, ContentStatus, ContentType } from "@/types/content";
import "@/pages/pages.css";

type ContentRow = { id: string; data: ContentDocument };

function labelType(t: ContentType | undefined): string {
  if (t === "paid") return "유료";
  if (t === "homework") return "과제";
  return "공유";
}

export function ClassroomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { firebaseUser, isTeacherApproved } = useAuth();
  const [room, setRoom] = useState<(ClassroomDocument & { id: string }) | null>(null);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const isOwner = useMemo(
    () => !!(room && firebaseUser && room.teacherId === firebaseUser.uid),
    [room, firebaseUser]
  );

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

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light">
        <nav className="classroom-page__breadcrumb">
          <Link to="/classroom">← 강의실 목록</Link>
        </nav>
        {err && <p className="auth-error">{err}</p>}
        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p className="ui-ko">불러오는 중…</p>
          </div>
        ) : !room ? null : (
          <>
            <div className="admin-layout__title-row">
              <h1>{room.title}</h1>
              <span className="ui-ko">강의실 자료</span>
            </div>
            <p className="classroom-page__lede">{room.description || ""}</p>
            {isOwner && (
              <p>
                <Link to={`/classroom/${room.id}/manage`} className="btn btn--primary btn--stack">
                  강의실 관리 (자료·과제 등록)
                </Link>
              </p>
            )}
            <h2 className="classroom-page__subhead">등록된 자료</h2>
            {visibleContents.length === 0 ? (
              <p style={{ color: "var(--light-text-muted, #6b7280)" }}>
                아직 표시할 자료가 없습니다. (승인 대기 중이거나 등록 전일 수 있습니다.)
              </p>
            ) : (
              <ul className="classroom-page__materials">
                {visibleContents.map((c) => {
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
                          <p className="classroom-page__paid-note">
                            유료 자료입니다. 상세에서 결제·구매 안내를 확인하세요.
                          </p>
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
                })}
              </ul>
            )}
          </>
        )}
      </main>
    </DashboardShell>
  );
}
