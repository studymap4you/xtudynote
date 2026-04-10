import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { TeacherRoute } from "@/components/TeacherRoute";
import { DashboardShell } from "@/components/DashboardShell";
import { db } from "@/firebase/config";
import "@/pages/pages.css";

function Inner() {
  const { firebaseUser } = useAuth();
  const nav = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    const t = title.trim();
    if (!t) {
      setErr("강의실 이름을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const ref = await addDoc(collection(db, "classrooms"), {
        teacherId: firebaseUser.uid,
        title: t,
        description: description.trim(),
        createdAt: serverTimestamp(),
      });
      nav(`/classroom/${ref.id}/manage`, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light">
        <div className="admin-layout__title-row">
          <h1>강의실 개설</h1>
          <span className="ui-ko">이름과 소개를 등록한 뒤 자료·과제를 연결합니다</span>
        </div>
        {err && <p className="auth-error">{err}</p>}
        <form className="classroom-page__form" onSubmit={(e) => void handleSubmit(e)}>
          <label className="auth-field">
            강의실 이름
            <input
              className="add-passage__control"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 고2 통합수학 A반"
              required
            />
          </label>
          <label className="auth-field">
            소개 (선택)
            <textarea
              className="add-passage__control add-passage__intro"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="수업 목표, 주차 안내 등"
            />
          </label>
          <div className="add-passage__actions">
            <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
              {saving ? "저장 중…" : "개설하고 관리로 이동"}
            </button>
            <Link to="/classroom" className="btn btn--ghost btn--stack">
              취소
            </Link>
          </div>
        </form>
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
