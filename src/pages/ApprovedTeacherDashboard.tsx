import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { AddMaterialButton } from "@/components/AddMaterialButton";
import { StudentManagementSection } from "@/components/teacher/StudentManagementSection";
import { db } from "@/firebase/config";
import "@/pages/pages.css";

export function ApprovedTeacherDashboard() {
  const { profile, firebaseUser, refreshProfile } = useAuth();
  const [bankName, setBankName] = useState(profile?.bankName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(profile?.bankAccountNumber ?? "");
  const [accountHolder, setAccountHolder] = useState(profile?.accountHolder ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setBankName(profile?.bankName ?? "");
    setBankAccountNumber(profile?.bankAccountNumber ?? "");
    setAccountHolder(profile?.accountHolder ?? "");
  }, [profile?.bankName, profile?.bankAccountNumber, profile?.accountHolder]);

  async function saveBank(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    setSaving(true);
    setMsg(null);
    try {
      await updateDoc(doc(db, "users", firebaseUser.uid), {
        bankName: bankName.trim(),
        bankAccountNumber: bankAccountNumber.trim(),
        accountHolder: accountHolder.trim(),
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
            <AddMaterialButton />
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

        <section className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">판매 통계</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                날짜별·자료별 집계
              </span>
            </div>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "0.75rem" }}>
            관리자가 등록한 판매 데이터를 확인합니다.
          </p>
          <Link to="/teacher/stats" className="btn btn--primary btn--stack">
            <span className="ui-en">Open sales stats</span>
            <span className="ui-ko">판매 통계 보기</span>
          </Link>
        </section>

        <aside className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">정산 계좌</h2>
              <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
                유료 정산용
              </span>
            </div>
          </div>
          <form onSubmit={(e) => void saveBank(e)}>
            <label className="auth-field">
              은행
              <input
                className="add-passage__control"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="예: 국민은행"
                autoComplete="off"
              />
            </label>
            <label className="auth-field">
              계좌번호
              <input
                className="add-passage__control"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="숫자만 또는 하이픈 포함"
                autoComplete="off"
              />
            </label>
            <label className="auth-field">
              예금주
              <input
                className="add-passage__control"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="예금주 실명"
                autoComplete="off"
              />
            </label>
            {msg && <p className={msg.includes("실패") ? "auth-error" : undefined}>{msg}</p>}
            <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </form>
        </aside>
      </div>

      <StudentManagementSection />
    </main>
  );
}
