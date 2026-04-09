import { useEffect, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import "@/pages/pages.css";

/** 학습자 정산 계좌 (은행 / 계좌번호 / 예금주) */
export function StudentSettlementForm() {
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

  async function save(e: React.FormEvent) {
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
    <section className="panel">
      <div className="panel__head">
        <div>
          <h2 className="panel__title">정산 계좌</h2>
          <span className="ui-ko" style={{ fontSize: "0.8rem" }}>
            판매 수익 정산용 (은행 / 계좌번호 / 예금주)
          </span>
        </div>
      </div>
      <form className="student-settlement-form" onSubmit={(e) => void save(e)}>
        <label className="reg-form__field">
          <span className="reg-form__label-line">
            <span className="reg-form__label-en">Bank name</span>
            <span className="reg-form__label-ko">은행</span>
          </span>
          <input
            className="add-passage__control"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="예: 국민은행"
            autoComplete="off"
          />
        </label>
        <label className="reg-form__field">
          <span className="reg-form__label-line">
            <span className="reg-form__label-en">Account number</span>
            <span className="reg-form__label-ko">계좌번호</span>
          </span>
          <input
            className="add-passage__control"
            value={bankAccountNumber}
            onChange={(e) => setBankAccountNumber(e.target.value)}
            placeholder="숫자 또는 하이픈 포함"
            autoComplete="off"
          />
        </label>
        <label className="reg-form__field">
          <span className="reg-form__label-line">
            <span className="reg-form__label-en">Account holder</span>
            <span className="reg-form__label-ko">예금주</span>
          </span>
          <input
            className="add-passage__control"
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            placeholder="실명"
            autoComplete="off"
          />
        </label>
        {msg && <p className={msg.includes("실패") ? "auth-error" : undefined}>{msg}</p>}
        <button type="submit" className="btn btn--primary btn--stack" disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </form>
    </section>
  );
}
