import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, type Timestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import type { ClassroomDocument } from "@/types/classroom";
import "@/pages/pages.css";

type Row = ClassroomDocument & { id: string };

function formatAt(raw: unknown): string {
  if (raw && typeof raw === "object" && "toDate" in raw && typeof (raw as Timestamp).toDate === "function") {
    try {
      return (raw as Timestamp).toDate().toLocaleString();
    } catch {
      return "—";
    }
  }
  return "—";
}

export function ClassroomCatalogPage() {
  const { firebaseUser, isTeacherApproved } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    const q = query(collection(db, "classrooms"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Row[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as ClassroomDocument) }));
        setRows(list);
        setLoading(false);
      },
      (e) => {
        setErr(e.message || "목록을 불러오지 못했습니다.");
        setLoading(false);
      },
    );
    return () => unsub();
  }, [firebaseUser?.uid]);

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light">
        <nav className="classroom-page__breadcrumb" style={{ marginBottom: "var(--space-3)" }}>
          <Link to="/classroom">← 내 강의실</Link>
        </nav>
        <div className="admin-layout__title-row">
          <h1>전체 강의실</h1>
          <span className="ui-ko">강의 신청 · 개설된 강의실 목록</span>
        </div>
        <p className="classroom-page__lede">
          강의 소개를 확인한 뒤 입장해 주세요. 멤버로 등록되지 않은 강의실은 자료·영상·질의응답 이용이 제한됩니다. 선생님께 수강(멤버) 등록을 요청할 수 있습니다.
        </p>
        {err && <p className="auth-error">{err}</p>}
        {loading ? (
          <div className="route-loading route-loading--light">
            <div className="route-loading__spinner" />
            <p className="ui-ko">불러오는 중…</p>
          </div>
        ) : rows.length === 0 ? (
          <p style={{ color: "var(--light-text-muted, #6b7280)" }}>등록된 강의실이 없습니다.</p>
        ) : (
          <ul className="classroom-page__list">
            {rows.map((r) => (
              <li key={r.id} className="classroom-page__card">
                <div>
                  <h2 className="classroom-page__card-title">{r.title}</h2>
                  <p className="classroom-page__card-desc">{r.description || "설명 없음"}</p>
                  <p className="classroom-page__card-meta">개설 {formatAt(r.createdAt)}</p>
                </div>
                <div className="classroom-page__card-actions">
                  <Link to={`/classroom/${r.id}`} className="btn btn--primary btn--stack">
                    상세 보기
                  </Link>
                  {isTeacherApproved && firebaseUser?.uid === r.teacherId && (
                    <Link to={`/classroom/${r.id}/manage`} className="btn btn--ghost btn--stack">
                      관리
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </DashboardShell>
  );
}
