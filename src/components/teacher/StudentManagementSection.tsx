import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import type { Timestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import {
  isEmailJsConfigured,
  normalizeRecipientEmail,
  sendHomeworkEmailsSequential,
} from "@/lib/sendHomeworkEmails";
import type { CrmStudentDocument } from "@/types/crmStudent";
import type { ContentDocument } from "@/types/content";

type StudentRow = CrmStudentDocument & { id: string };

type HomeworkOption = {
  contentId: string;
  homeworkCode: string;
  label: string;
};

const CUSTOM_HW_VALUE = "__custom__";

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function rowTimeMs(r: StudentRow): number {
  if (r.createdAt && typeof (r.createdAt as Timestamp).toMillis === "function") {
    return (r.createdAt as Timestamp).toMillis();
  }
  return Number.MAX_SAFE_INTEGER;
}

function sortStudentsByCreatedDesc(rows: StudentRow[]): StudentRow[] {
  return [...rows].sort((a, b) => rowTimeMs(b) - rowTimeMs(a));
}

function useAutoDismissFormMessage(
  message: string | null,
  setMessage: (v: string | null) => void
) {
  useEffect(() => {
    if (!message) return;
    if (message.includes("실패") || message.includes("오류")) return;
    const ms = message.includes("성공적으로 발송") ? 6000 : 3000;
    const t = setTimeout(() => setMessage(null), ms);
    return () => clearTimeout(t);
  }, [message, setMessage]);
}

export function StudentManagementSection() {
  const { firebaseUser } = useAuth();
  const emailJsReady = isEmailJsConfigured();
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sendOpen, setSendOpen] = useState(false);
  const [homeworkOptions, setHomeworkOptions] = useState<HomeworkOption[]>([]);
  const [homeworkSelect, setHomeworkSelect] = useState<string>("");
  const [homeworkCodeCustom, setHomeworkCodeCustom] = useState("");
  const [dispatchMessage, setDispatchMessage] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMsg, setDispatchMsg] = useState<string | null>(null);

  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  useAutoDismissFormMessage(formMsg, setFormMsg);

  useEffect(() => {
    if (!firebaseUser) {
      setRows([]);
      setHomeworkOptions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setListError(null);

    const qStudents = query(collection(db, "students"), where("teacherId", "==", firebaseUser.uid));

    const unsubStudents = onSnapshot(
      qStudents,
      (snap) => {
        const next: StudentRow[] = [];
        snap.forEach((d) => {
          const data = d.data() as CrmStudentDocument;
          next.push({ id: d.id, ...data });
        });
        setRows(sortStudentsByCreatedDesc(next));
        setLoading(false);
      },
      (err) => {
        setListError(err.message || "학생 목록을 불러오지 못했습니다.");
        setLoading(false);
      }
    );

    const qHw = query(
      collection(db, "contents"),
      where("authorId", "==", firebaseUser.uid),
      where("type", "==", "homework")
    );

    const unsubHw = onSnapshot(
      qHw,
      (snap) => {
        const opts: HomeworkOption[] = [];
        snap.forEach((d) => {
          const x = d.data() as ContentDocument;
          const code = (x.homeworkCode ?? "").trim();
          if (!code) return;
          const subj = (x.subject ?? "").trim() || "과제";
          opts.push({
            contentId: d.id,
            homeworkCode: code,
            label: `${code} · ${subj}`,
          });
        });
        opts.sort((a, b) => b.homeworkCode.localeCompare(a.homeworkCode));
        setHomeworkOptions(opts);
      },
      () => {
        /* 과제 목록 실패 시 드롭다운은 직접 입력만 */
        setHomeworkOptions([]);
      }
    );

    return () => {
      unsubStudents();
      unsubHw();
    };
  }, [firebaseUser]);

  useEffect(() => {
    if (!sendOpen) return;
    if (homeworkOptions.length === 0) {
      setHomeworkSelect(CUSTOM_HW_VALUE);
    } else if (
      homeworkSelect === "" ||
      (homeworkSelect !== CUSTOM_HW_VALUE &&
        !homeworkOptions.some((o) => o.contentId === homeworkSelect))
    ) {
      setHomeworkSelect(homeworkOptions[0].contentId);
    }
  }, [sendOpen, homeworkOptions, homeworkSelect]);

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

  function resolveHomeworkCode(): string {
    if (homeworkSelect === CUSTOM_HW_VALUE) return homeworkCodeCustom.trim();
    const found = homeworkOptions.find((o) => o.contentId === homeworkSelect);
    return found?.homeworkCode.trim() ?? "";
  }

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
      const docRef = await addDoc(collection(db, "students"), {
        teacherId: firebaseUser.uid,
        name: n,
        phone: p,
        email: em,
        createdAt: serverTimestamp(),
      });
      const optimistic: StudentRow = {
        id: docRef.id,
        teacherId: firebaseUser.uid,
        name: n,
        phone: p,
        email: em,
        createdAt: null,
      };
      setRows((prev) => sortStudentsByCreatedDesc([optimistic, ...prev.filter((x) => x.id !== docRef.id)]));
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
    const code = resolveHomeworkCode();
    const msg = dispatchMessage.trim();
    if (!code) {
      setDispatchMsg("과제를 선택하거나 과제번호를 직접 입력해 주세요.");
      return;
    }
    if (!msg) {
      setDispatchMsg("안내 메시지를 입력해 주세요.");
      return;
    }
    const teacherEmail = (firebaseUser.email ?? "").trim();
    if (!teacherEmail) {
      setDispatchMsg(
        "로그인 계정에 이메일이 없습니다. 이메일이 연동된 로그인 방식(Google 등)을 사용해 주세요."
      );
      return;
    }

    const recipients: { name: string; email: string }[] = [];
    const invalidLines: string[] = [];
    for (const r of selectedRows) {
      const normalized = normalizeRecipientEmail(r.email);
      if (!normalized) {
        invalidLines.push(
          `${(r.name ?? "").trim() || "(이름 없음)"}: 이메일 없음 또는 형식 오류 — «${String(r.email ?? "").trim() || "(비어 있음)"}»`
        );
        continue;
      }
      recipients.push({
        name: (r.name ?? "").trim() || "학생",
        email: normalized,
      });
    }
    if (invalidLines.length > 0) {
      setDispatchMsg(`발송 전 이메일 검사에 실패했습니다.\n${invalidLines.join("\n")}`);
      return;
    }
    if (recipients.length === 0) {
      setDispatchMsg("유효한 이메일 주소를 가진 학생이 없습니다.");
      return;
    }

    setDispatching(true);
    setDispatchMsg(null);
    try {
      await sendHomeworkEmailsSequential({
        recipients,
        homeworkCode: code,
        message: msg,
        teacherEmail,
      });

      await addDoc(collection(db, "homework_dispatches"), {
        teacherId: firebaseUser.uid,
        homeworkCode: code,
        message: msg,
        recipientStudentIds: selectedRows.map((r) => r.id),
        recipients: selectedRows.map((r) => ({
          studentId: r.id,
          name: r.name,
          email: normalizeRecipientEmail(r.email) ?? "",
          phone: r.phone,
        })),
        createdAt: serverTimestamp(),
      });

      setSendOpen(false);
      setHomeworkSelect("");
      setHomeworkCodeCustom("");
      setDispatchMessage("");
      setFormMsg("성공적으로 발송되었습니다.");
    } catch (err) {
      setDispatchMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDispatching(false);
    }
  }

  function openEdit(r: StudentRow) {
    setEditing(r);
    setEditName(r.name);
    setEditPhone(r.phone);
    setEditEmail(r.email);
    setEditMsg(null);
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !editing) return;
    const n = editName.trim();
    const p = editPhone.trim();
    const em = editEmail.trim().toLowerCase();
    if (!n) {
      setEditMsg("이름을 입력해 주세요.");
      return;
    }
    if (!isValidEmail(em)) {
      setEditMsg("올바른 이메일 형식이 아닙니다.");
      return;
    }
    setEditSaving(true);
    setEditMsg(null);
    try {
      await updateDoc(doc(db, "students", editing.id), {
        name: n,
        phone: p,
        email: em,
      });
      setRows((prev) =>
        sortStudentsByCreatedDesc(
          prev.map((x) =>
            x.id === editing.id ? { ...x, name: n, phone: p, email: em } : x
          )
        )
      );
      setEditing(null);
      setFormMsg("수정되었습니다.");
    } catch (err) {
      setEditMsg(err instanceof Error ? err.message : "수정에 실패했습니다.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(r: StudentRow) {
    if (!firebaseUser) return;
    const ok = window.confirm(
      `${r.name} 학생을 목록에서 삭제할까요?\nDelete "${r.name}" from your list?`
    );
    if (!ok) return;
    try {
      await deleteDoc(doc(db, "students", r.id));
      setSelected((prev) => {
        const n = new Set(prev);
        n.delete(r.id);
        return n;
      });
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      setFormMsg("삭제되었습니다.");
    } catch (err) {
      setFormMsg(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    }
  }

  function openSendModal() {
    setDispatchMsg(null);
    if (homeworkOptions.length > 0) {
      setHomeworkSelect(homeworkOptions[0].contentId);
      setHomeworkCodeCustom("");
    } else {
      setHomeworkSelect(CUSTOM_HW_VALUE);
      setHomeworkCodeCustom("");
    }
    setSendOpen(true);
  }

  if (!firebaseUser) return null;

  return (
    <div className="crm-section">
      {!emailJsReady && (
        <div className="crm-emailjs-banner" role="status">
          <strong>EmailJS 미설정</strong>
          <span>
            실제 메일 발송을 위해 <code>.env.local</code>에{" "}
            <code>VITE_EMAILJS_PUBLIC_KEY</code>, <code>VITE_EMAILJS_SERVICE_ID</code>,{" "}
            <code>VITE_EMAILJS_TEMPLATE_ID</code>를 추가한 뒤 서버를 재시작하세요. 템플릿에는{" "}
            <code>email</code>(수신 주소), <code>homework_code</code>, <code>message</code> 변수가 필요합니다.
          </span>
        </div>
      )}

      {formMsg && (
        <div
          className={
            formMsg.includes("실패") || formMsg.includes("오류")
              ? "crm-feedback crm-feedback--err"
              : "crm-feedback crm-feedback--ok"
          }
          role="status"
        >
          {formMsg}
        </div>
      )}

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
              이름·연락처를 저장하고, 선택한 학생에게 과제번호와 안내를 일괄 발송합니다.
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
        </div>
      </form>

      {listError && <p className="crm-list-error">{listError}</p>}

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
          onClick={openSendModal}
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
                <div className="crm-list__actions">
                  <button
                    type="button"
                    className="crm-icon-btn"
                    title="Edit · 수정"
                    aria-label="Edit student"
                    onClick={() => openEdit(r)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M4 20h4l10.5-10.5-4-4L4 16v4z"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M14.5 5.5l4 4"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="crm-icon-btn crm-icon-btn--danger"
                    title="Delete · 삭제"
                    aria-label="Delete student"
                    onClick={() => void handleDelete(r)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path
                        d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M10 11v6M14 11v6M5 7l1 14a1 1 0 001 1h10a1 1 0 001-1l1-14"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sendOpen && (
        <div
          className="crm-modal-root"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crm-send-title"
        >
          <div
            className="crm-modal-backdrop"
            onClick={() => !dispatching && setSendOpen(false)}
          />
          <div className="crm-modal crm-modal--send">
            <button
              type="button"
              className="crm-modal__close"
              aria-label="Close"
              onClick={() => !dispatching && setSendOpen(false)}
            >
              ×
            </button>
            <h3 id="crm-send-title" className="crm-modal__title">
              <span className="crm-modal__title-en">Send homework notice</span>
              <span className="crm-modal__title-ko">과제 안내 일괄 발송</span>
            </h3>
            <p className="crm-modal__hint">
              선택한 <strong>{selectedRows.length}</strong>명의 이메일로 순차 발송합니다. 본문에는{" "}
              <strong>과제번호</strong>와 선생님 <strong>안내 메시지</strong>가 포함됩니다 (EmailJS).
            </p>
            <form onSubmit={(e) => void handleDispatch(e)}>
              <label className="crm-field crm-field--block">
                <span className="crm-field__label">
                  <span className="crm-field__en">Select homework</span>
                  <span className="crm-field__ko">과제 선택</span>
                </span>
                <select
                  className="crm-field__select"
                  value={homeworkSelect}
                  onChange={(e) => setHomeworkSelect(e.target.value)}
                >
                  {homeworkOptions.map((o) => (
                    <option key={o.contentId} value={o.contentId}>
                      {o.label}
                    </option>
                  ))}
                  <option value={CUSTOM_HW_VALUE}>직접 입력 · Enter code manually</option>
                </select>
              </label>
              {homeworkSelect === CUSTOM_HW_VALUE && (
                <label className="crm-field crm-field--block">
                  <span className="crm-field__label">
                    <span className="crm-field__en">Homework code</span>
                    <span className="crm-field__ko">과제번호</span>
                  </span>
                  <input
                    className="crm-field__input"
                    value={homeworkCodeCustom}
                    onChange={(e) => setHomeworkCodeCustom(e.target.value)}
                    placeholder="예: ABC12"
                  />
                </label>
              )}
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
              {dispatchMsg && (
                <p className="crm-msg crm-msg--err crm-msg--multiline">{dispatchMsg}</p>
              )}
              <div className="crm-modal__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={dispatching}
                  onClick={() => setSendOpen(false)}
                >
                  취소 · Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn--primary"
                  disabled={dispatching || !emailJsReady}
                  title={
                    !emailJsReady
                      ? "EmailJS 환경 변수를 설정한 뒤 사용할 수 있습니다."
                      : undefined
                  }
                >
                  {dispatching ? "발송 중…" : "발송 · Send"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="crm-modal-root" role="dialog" aria-modal="true" aria-labelledby="crm-edit-title">
          <div className="crm-modal-backdrop" onClick={() => !editSaving && setEditing(null)} />
          <div className="crm-modal crm-modal--edit">
            <h3 id="crm-edit-title" className="crm-modal__title">
              <span className="crm-modal__title-en">Edit student</span>
              <span className="crm-modal__title-ko">학생 정보 수정</span>
            </h3>
            <form onSubmit={(e) => void handleEditSave(e)}>
              <label className="crm-field crm-field--block">
                <span className="crm-field__label">
                  <span className="crm-field__en">Name</span>
                  <span className="crm-field__ko">이름</span>
                </span>
                <input
                  className="crm-field__input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </label>
              <label className="crm-field crm-field--block">
                <span className="crm-field__label">
                  <span className="crm-field__en">Phone</span>
                  <span className="crm-field__ko">전화번호</span>
                </span>
                <input
                  className="crm-field__input"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                />
              </label>
              <label className="crm-field crm-field--block">
                <span className="crm-field__label">
                  <span className="crm-field__en">Email</span>
                  <span className="crm-field__ko">이메일</span>
                </span>
                <input
                  className="crm-field__input"
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                />
              </label>
              {editMsg && <p className="crm-msg crm-msg--err">{editMsg}</p>}
              <div className="crm-modal__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={editSaving}
                  onClick={() => setEditing(null)}
                >
                  취소
                </button>
                <button type="submit" className="btn btn--primary" disabled={editSaving}>
                  {editSaving ? "저장 중…" : "저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
