import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import "@/pages/pages.css";

export function ApprovedTeacherDashboard() {
  const { profile, firebaseUser, refreshProfile } = useAuth();
  const [bankAccount, setBankAccount] = useState(profile?.bankAccount ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setBankAccount(profile?.bankAccount ?? "");
  }, [profile?.bankAccount]);

  async function saveBank(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    setSaving(true);
    setMsg(null);
    try {
      await updateDoc(doc(db, "users", firebaseUser.uid), {
        bankAccount: bankAccount.trim(),
      });
      await refreshProfile();
      setMsg("저장되었습니다.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="dashboard">
      <div className="dashboard__title-wrap">
        <h1 className="dashboard__title">Educator workspace</h1>
        <span className="ui-ko">교육자 워크스페이스</span>
      </div>
      <p className="dashboard__subtitle">
        <span className="ui-en">
          Verified profile — organize cohorts, publish learning assets, and tie them to logic-based feedback.
        </span>
        <span className="ui-ko">
          검증된 계정입니다. 학습 그룹·자료·논리 기반 피드백을 연결하는 작업 공간입니다.
        </span>
      </p>

      <div className="dashboard-grid dashboard-grid--teacher">
        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Learning materials</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                학습 자료 · 과제
              </span>
            </div>
            <span className="panel__badge panel__badge--ok">Teacher</span>
          </div>
          <div className="badge-row" style={{ flexWrap: "wrap" }}>
            <Link to="/teacher/homework/new" className="btn btn--primary btn--stack">
              <span className="ui-en">New homework</span>
              <span className="ui-ko">과제 출제</span>
            </Link>
            <Link to="/teacher/submissions" className="btn btn--ghost btn--stack">
              <span className="ui-en">Submissions</span>
              <span className="ui-ko">과제 피드백</span>
            </Link>
            <Link to="/library" className="btn btn--ghost btn--stack">
              <span className="ui-en">Library</span>
              <span className="ui-ko">라이브러리</span>
            </Link>
          </div>
        </section>

        <aside className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">정산 계좌</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                bankAccount
              </span>
            </div>
          </div>
          <form onSubmit={(e) => void saveBank(e)}>
            <label className="auth-field">
              계좌 정보
              <textarea
                className="add-passage__control add-passage__intro"
                rows={4}
                value={bankAccount}
                onChange={(e) => setBankAccount(e.target.value)}
                placeholder="은행명, 계좌번호, 예금주 (필요 시 메모)"
              />
            </label>
            {msg && <p className={msg.includes("실패") ? "auth-error" : undefined}>{msg}</p>}
            <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </form>
        </aside>
      </div>
    </main>
  );
}
