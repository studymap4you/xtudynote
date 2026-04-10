import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import type { CrmStudentDocument } from "@/types/crmStudent";

type StudentRow = CrmStudentDocument & { id: string };

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export function StudentManagementSection() {
  const { firebaseUser } = useAuth();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [homeworkCode, setHomeworkCode] = useState("");
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseUser) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "students"),
      where("teacherId", "==", firebaseUser.uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: StudentRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as CrmStudentDocument;
          next.push({
            id: d.id,
            ...data,
          });
        });
        setRows(next);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [firebaseUser]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = useCallback(() => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }, [allSelected, rows]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.id)),
    [rows, selected]
  );

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    const n = name.trim();
    const p = phone.trim();
    const em = email.trim().toLowerCase();
    if (!n) {
      setFormMsg("이름을 입력해 주세요.");
      return;
    }
    if (!isValidEmail(em)) {
      setFormMsg("올바른 이메일 형식이 아닙니다.");
      return;
    }
    setSaving(true);
    setFormMsg(null);
    try {
      await addDoc(collection(db, "students"), {
        teacherId: firebaseUser.uid,
        name: n,
        phone: p,
        email: em,
        createdAt: serverTimestamp(),
      });
      setName("");
      setPhone("");
      setEmail("");
      setFormMsg("저장되었습니다.");
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || selectedRows.length === 0) return;
    const code = homeworkCode.trim();
    const msg = dispatchMessage.trim();
    if (!code) {
      setDispatchMsg("과제번호를 입력해 주세요.");
      return;
    }
    if (!msg) {
      setDispatchMsg("안내 메시지를 입력해 주세요.");
      return;
    }
    setDispatching(true);
    setDispatchMsg(null);
    try {
      await addDoc(collection(db, "homework_dispatches"), {
        teacherId: firebaseUser.uid,
        homeworkCode: code,
        message: msg,
        recipientStudentIds: selectedRows.map((r) => r.id),
        recipients: selectedRows.map((r) => ({
          studentId: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
        })),
        createdAt: serverTimestamp(),
      });
      setSendOpen(false);
      setHomeworkCode("");
      setDispatchMessage("");
      setFormMsg(
        "발송 기록이 저장되었습니다. 이메일·알림은 백엔드 연동 시 수신자에게 전달됩니다."
      );
    } catch (err) {
      setDispatchMsg(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setDispatching(false);
    }
  }

  if (!firebaseUser) return null;

  return (
    <div className="crm-section">
      <div className="crm-section__head">
        <div>
          <h2 className="crm-section__title">
            <span className="crm-section__title-en">Student Management</span>
            <span className="crm-section__title-ko">학생 관리 (CRM)</span>
          </h2>
          <p className="crm-section__lead">
            <span className="crm-section__lead-en">
              Register offline cohort contacts and send homework codes in bulk.
            </span>
            <span className="crm-section__lead-ko">
              이름·연락처를 저장하고, 선택한 학생에게 과제번호와 안내를 일괄 기록합니다.
            </span>
          </p>
        </div>
      </div>

      <form className="crm-form" onSubmit={(e) => void handleAddStudent(e)}>
        <div className="crm-form__row">
          <label className="crm-field">
            <span className="crm-field__label">
              <span className="crm-field__en">Name</span>
              <span className="crm-field__ko">이름</span>
            </span>
            <input
              className="crm-field__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              autoComplete="name"
            />
          </label>
          <label className="crm-field">
            <span className="crm-field__label">
              <span className="crm-field__en">Phone</span>
              <span className="crm-field__ko">전화번호</span>
            </span>
            <input
              className="crm-field__input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              autoComplete="tel"
            />
          </label>
          <label className="crm-field crm-field--grow">
            <span className="crm-field__label">
              <span className="crm-field__en">Email</span>
              <span className="crm-field__ko">이메일</span>
            </span>
            <input
              className="crm-field__input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
              autoComplete="email"
            />
          </label>
        </div>
        <div className="crm-form__actions">
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? "저장 중…" : "Add student · 학생 추가"}
          </button>
          {formMsg && (
            <span className={formMsg.includes("실패") ? "crm-msg crm-msg--err" : "crm-msg"}>
              {formMsg}
            </span>
          )}
        </div>
      </form>

      <div className="crm-toolbar">
        <div className="crm-toolbar__left">
          <label className="crm-check">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            <span>
              <span className="crm-check__en">Select all</span>
              <span className="crm-check__ko">전체 선택</span>
            </span>
          </label>
          <span className="crm-count">
            <span className="crm-count__en">{selected.size} selected</span>
            <span className="crm-count__ko">{selected.size}명 선택됨</span>
          </span>
        </div>
        <button
          type="button"
          className="btn btn--primary btn--stack"
          disabled={selected.size === 0}
          onClick={() => {
            setDispatchMsg(null);
            setSendOpen(true);
          }}
        >
          <span className="ui-en">Send Homework</span>
          <span className="ui-ko">과제 발송</span>
        </button>
      </div>

      <div className="crm-list-wrap">
        {loading ? (
          <p className="crm-empty">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="crm-empty">
            등록된 학생이 없습니다. 위 양식에서 추가해 주세요.
          </p>
        ) : (
          <ul className="crm-list">
            {rows.map((r) => (
              <li key={r.id} className="crm-list__row">
                <label className="crm-list__check">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                  />
                </label>
                <div className="crm-list__main">
                  <div className="crm-list__name">{r.name}</div>
                  <div className="crm-list__meta">
                    <span className="crm-list__email">{r.email}</span>
                    <span className="crm-list__phone">{r.phone || "—"}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sendOpen && (
        <div className="crm-modal-root" role="dialog" aria-modal="true" aria-labelledby="crm-send-title">
          <div className="crm-modal-backdrop" onClick={() => !dispatching && setSendOpen(false)} />
          <div className="crm-modal">
            <h3 id="crm-send-title" className="crm-modal__title">
              <span className="crm-modal__title-en">Send homework notice</span>
              <span className="crm-modal__title-ko">과제 안내 일괄 발송</span>
            </h3>
            <p className="crm-modal__hint">
              선택한 {selectedRows.length}명에게 과제번호와 메시지가 기록됩니다. (이메일 자동 발송은 서버 연동 시
              활성화)
            </p>
            <form onSubmit={(e) => void handleDispatch(e)}>
              <label className="crm-field crm-field--block">
                <span className="crm-field__label">
                  <span className="crm-field__en">Homework code</span>
                  <span className="crm-field__ko">과제번호</span>
                </span>
                <input
                  className="crm-field__input"
                  value={homeworkCode}
                  onChange={(e) => setHomeworkCode(e.target.value)}
                  placeholder="예: HW-2026-041"
                />
              </label>
              <label className="crm-field crm-field--block">
                <span className="crm-field__label">
                  <span className="crm-field__en">Message</span>
                  <span className="crm-field__ko">안내 메시지</span>
                </span>
                <textarea
                  className="crm-field__textarea"
                  rows={5}
                  value={dispatchMessage}
                  onChange={(e) => setDispatchMessage(e.target.value)}
                  placeholder="과제 제출 방법, 마감일 등을 입력하세요."
                />
              </label>
              {dispatchMsg && <p className="crm-msg crm-msg--err">{dispatchMsg}</p>}
              <div className="crm-modal__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={dispatching}
                  onClick={() => setSendOpen(false)}
                >
                  Cancel · 취소
                </button>
                <button type="submit" className="btn btn--primary" disabled={dispatching}>
                  {dispatching ? "저장 중…" : "Confirm · 발송 기록 저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
