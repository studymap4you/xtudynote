import { useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import "@/pages/pages.css";

export function MaterialRegisterPage() {
  const { firebaseUser, profile, canManageMaterials, isStudent, isSuperAdmin } = useAuth();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submitStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !title.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, "material_requests"), {
        studentId: firebaseUser.uid,
        title: title.trim(),
        note: note.trim(),
        createdAt: serverTimestamp(),
      });
      window.alert("신청이 접수되었습니다. 마스터의 검수 후 2~3일 내에 등록됩니다.");
      setDone(true);
      setTitle("");
      setNote("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell light>
      <main className="admin-layout material-register admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>자료 등록</h1>
          <span className="ui-ko">스터디맵 검수 후 라이브러리에 반영됩니다</span>
        </div>
        <p className="material-register__notice">
          마스터의 검수 후 <strong>2~3일 내에</strong> 등록됩니다.
        </p>

        {canManageMaterials && (
          <section className="panel panel--light">
            <h2 className="panel__title">교육자 · 콘텐츠 담당</h2>
            <p style={{ color: "var(--light-text-muted, #4b5563)" }}>
              과제 출제 또는 관리자 등록 절차로 이어집니다.
            </p>
            <div className="badge-row" style={{ flexWrap: "wrap", marginTop: "1rem" }}>
              <Link to="/teacher/homework/new" className="btn btn--primary btn--stack">
                <span className="ui-en">Homework</span>
                <span className="ui-ko">과제 출제</span>
              </Link>
              {isSuperAdmin && (
                <Link to="/admin/contents/new" className="btn btn--ghost btn--stack">
                  <span className="ui-en">Admin register</span>
                  <span className="ui-ko">관리자 등록</span>
                </Link>
              )}
            </div>
          </section>
        )}

        {isStudent && (
          <section className="panel panel--light">
            <h2 className="panel__title">학습자 신청</h2>
            {done && (
              <p style={{ color: "var(--light-accent-ok, #047857)" }}>접수되었습니다. 감사합니다.</p>
            )}
            <form onSubmit={(e) => void submitStudent(e)}>
              <label className="auth-field">
                제목
                <input
                  className="add-passage__control"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </label>
              <label className="auth-field">
                요청 내용 (선택)
                <textarea
                  className="add-passage__control add-passage__intro"
                  rows={5}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
                신청하기
              </button>
            </form>
          </section>
        )}

        {!canManageMaterials && !isStudent && profile && (
          <p className="auth-error">이 페이지는 학생 또는 교육자 계정에서 이용할 수 있습니다.</p>
        )}

        <p style={{ marginTop: "1.5rem" }}>
          <Link to="/dashboard" className="btn btn--ghost btn--stack">
            ← 대시보드
          </Link>
        </p>
      </main>
    </DashboardShell>
  );
}
