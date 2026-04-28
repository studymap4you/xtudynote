import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
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
    <main className="dashboard dashboard--educator">
      <header className="educator-hero">
        <p className="educator-hero__eyebrow">Verified educator</p>
        <div className="educator-hero__titles">
          <h1 className="dashboard__title">Educator workspace</h1>
          <span className="ui-ko educator-hero__title-ko">교육자 워크스페이스</span>
        </div>
        <p className="educator-hero__lead">
          <span className="educator-hero__lead-en">
            Organize cohorts in classrooms, attach learning materials per class, and use logic-based
            feedback with your students.
          </span>
          <span className="educator-hero__lead-ko">
            검증된 계정입니다. 강의실별로 학습 자료를 올리고, 과제·피드백을 이어가는 작업 공간입니다.
          </span>
        </p>
      </header>

      <div className="educator-grid">
        <section className="educator-card educator-card--materials" aria-labelledby="educator-materials-heading">
          <div className="educator-card__top">
            <div>
              <p className="educator-card__eyebrow" id="educator-materials-eyebrow">
                Learning materials
              </p>
              <h2 className="educator-card__title" id="educator-materials-heading">
                학습 자료
              </h2>
              <p className="educator-card__desc">
                자료 등록은 <strong>내 강의실</strong>에 들어간 뒤, 해당 강의실의「자료」탭에서 진행합니다. 강의실마다
                별도로 등록됩니다.
              </p>
            </div>
            <span className="educator-pill">Teacher</span>
          </div>
          <div className="educator-card__cta-row">
            <Link to="/classroom" className="educator-btn educator-btn--primary">
              <span className="educator-btn__en">Open my classrooms</span>
              <span className="educator-btn__ko">내 강의실로 이동</span>
            </Link>
          </div>
          <ul className="educator-quick-links" aria-label="관련 바로가기">
            <li>
              <Link to="/teacher/homework/new" className="educator-quick-links__a">
                <span className="educator-quick-links__en">New homework</span>
                <span className="educator-quick-links__ko">과제 출제</span>
              </Link>
            </li>
            <li>
              <Link to="/teacher/submissions" className="educator-quick-links__a">
                <span className="educator-quick-links__en">Submissions</span>
                <span className="educator-quick-links__ko">과제 피드백</span>
              </Link>
            </li>
            <li>
              <Link to="/library" className="educator-quick-links__a">
                <span className="educator-quick-links__en">Library</span>
                <span className="educator-quick-links__ko">라이브러리</span>
              </Link>
            </li>
            <li>
              <Link to="/teacher/exam-builder" className="educator-quick-links__a">
                <span className="educator-quick-links__en">AI exam paper</span>
                <span className="educator-quick-links__ko">AI 시험지·출제</span>
              </Link>
            </li>
            <li>
              <Link to="/english-passage-lab" className="educator-quick-links__a">
                <span className="educator-quick-links__en">English passage lab</span>
                <span className="educator-quick-links__ko">영어 지문 학습</span>
              </Link>
            </li>
          </ul>
        </section>

        <section className="educator-card educator-card--stats" aria-labelledby="educator-stats-heading">
          <p className="educator-card__eyebrow">Sales</p>
          <h2 className="educator-card__title" id="educator-stats-heading">
            판매 통계
          </h2>
          <p className="educator-card__desc educator-card__desc--compact">
            날짜·자료별 집계를 확인합니다.
          </p>
          <Link to="/teacher/stats" className="educator-btn educator-btn--secondary">
            <span className="educator-btn__en">Open sales stats</span>
            <span className="educator-btn__ko">판매 통계 보기</span>
          </Link>
        </section>

        <section className="educator-card educator-card--bank" aria-labelledby="educator-bank-heading">
          <p className="educator-card__eyebrow">Settlement</p>
          <h2 className="educator-card__title" id="educator-bank-heading">
            정산 계좌
          </h2>
          <p className="educator-card__desc educator-card__desc--compact">유료 정산에 사용할 계좌입니다.</p>
          <form className="educator-bank-form" onSubmit={(e) => void saveBank(e)}>
            <label className="educator-field">
              <span className="educator-field__label">은행</span>
              <input
                className="educator-field__input"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="예: 국민은행"
                autoComplete="off"
              />
            </label>
            <label className="educator-field">
              <span className="educator-field__label">계좌번호</span>
              <input
                className="educator-field__input"
                value={bankAccountNumber}
                onChange={(e) => setBankAccountNumber(e.target.value)}
                placeholder="숫자만 또는 하이픈 포함"
                autoComplete="off"
              />
            </label>
            <label className="educator-field">
              <span className="educator-field__label">예금주</span>
              <input
                className="educator-field__input"
                value={accountHolder}
                onChange={(e) => setAccountHolder(e.target.value)}
                placeholder="예금주 실명"
                autoComplete="off"
              />
            </label>
            {msg && (
              <p className={msg.includes("실패") ? "educator-form-msg educator-form-msg--err" : "educator-form-msg"}>
                {msg}
              </p>
            )}
            <button type="submit" className="educator-btn educator-btn--primary" disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
          </form>
        </section>
      </div>

      <div className="educator-crm">
        <StudentManagementSection />
      </div>
    </main>
  );
}
