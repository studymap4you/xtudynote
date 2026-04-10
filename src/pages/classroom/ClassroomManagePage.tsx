import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { TeacherRoute } from "@/components/TeacherRoute";
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import type { ClassroomDocument } from "@/types/classroom";
import "@/pages/pages.css";

function Inner() {
  const { id } = useParams<{ id: string }>();
  const { firebaseUser } = useAuth();
  const [room, setRoom] = useState<(ClassroomDocument & { id: string }) | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);

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
        if (!cancelled) setRoom({ id: s.id, ...d });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, firebaseUser]);

  const q = (path: string) => `${path}?classroomId=${encodeURIComponent(id ?? "")}`;

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

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light">
        <nav className="classroom-page__breadcrumb">
          <Link to="/classroom">← 강의실 목록</Link>
          {" · "}
          <Link to={`/classroom/${room.id}`}>입장 화면</Link>
        </nav>
        <div className="admin-layout__title-row">
          <h1>{room.title} — 관리</h1>
          <span className="ui-ko">자료 등록·동영상·과제는 아래로 연결됩니다 (라이브러리 동기화는 승인된 콘텐츠 정책과 동일)</span>
        </div>
        <p className="classroom-page__lede">
          이 강의실에서 등록하는 항목에는 자동으로 <strong>강의실 ID</strong>가 붙습니다. 과제·직접 등록 콘텐츠는
          승인된 선생님 계정 기준으로 <strong>라이브러리에 반영</strong>됩니다. 자료/동영상 <strong>신청</strong> 건은
          기존처럼 관리자 검수 후 공개됩니다.
        </p>

        <div className="classroom-page__manage-grid">
          <Link to={q("/teacher/homework/new")} className="classroom-page__manage-card">
            <h2>과제 출제</h2>
            <p>파일·가이드와 함께 과제를 등록합니다. 강의실·라이브러리에 연결됩니다.</p>
            <span className="classroom-page__manage-go">이동 →</span>
          </Link>
          <Link to={q("/material/register")} className="classroom-page__manage-card">
            <h2>자료 등록 신청</h2>
            <p>학습·참고 자료 업로드 (검수 후 라이브러리 반영)</p>
            <span className="classroom-page__manage-go">이동 →</span>
          </Link>
          <Link to={q("/video/register")} className="classroom-page__manage-card">
            <h2>동영상 강의 등록 신청</h2>
            <p>영상 URL 기반 강의 (검수 후 반영)</p>
            <span className="classroom-page__manage-go">이동 →</span>
          </Link>
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
