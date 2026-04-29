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
import { buildHomeworkSmsHref, normalizeSmsDialString } from "@/lib/smsLinks";
import type { CrmStudentDocument } from "@/types/crmStudent";
import type { ContentDocument } from "@/types/content";

type StudentRow = CrmStudentDocument & { id: string };

type HomeworkOption = {
  contentId: string;
  homeworkCode: string;
  shortCode?: string;
  label: string;
};

const CUSTOM_HW_VALUE = "__custom__";

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
    const ms =
      message.includes("기록이 저장") || message.includes("이메일") ? 6000 : 3000;
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
          const pin = (x.shortCode ?? "").trim();
          opts.push({
            contentId: d.id,
            homeworkCode: code,
            shortCode: pin || undefined,
            label: pin ? `${pin} · ${subj}` : `${code} · ${subj}`,
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

  /** Firestore·과제 식별용 전체 코드 (HW-…) */
  function resolveHomeworkCode(): string {
    if (homeworkSelect === CUSTOM_HW_VALUE) return homeworkCodeCustom.trim();
    const found = homeworkOptions.find((o) => o.contentId === homeworkSelect);
    return found?.homeworkCode.trim() ?? "";
  }

  /** 문자·이메일 본문용 — 등록 과제는 4자리 안내 번호 우선 */
  function resolveHomeworkCodeForMessage(): string {
    if (homeworkSelect === CUSTOM_HW_VALUE) return homeworkCodeCustom.trim();
    const found = homeworkOptions.find((o) => o.contentId === homeworkSelect);
    const pin = found?.shortCode?.trim();
    return pin || (found?.homeworkCode.trim() ?? "");
  }

  const smsHrefInModal = useMemo(() => {
    if (selectedRows.length !== 1) return null;
    const code = resolveHomeworkCodeForMessage();
    const msg = dispatchMessage.trim();
    if (!code || !msg) return null;
    return buildHomeworkSmsHref(selectedRows[0].phone, code, msg);
  }, [
    selectedRows,
    homeworkSelect,
    homeworkCodeCustom,
    homeworkOptions,
    dispatchMessage,
  ]);

  async function handleAddStudent(e: React.FormEvent) {
    e.preventDefault();
    if (!firebaseUser) return;
    const n = name.trim();
    const p = phone.trim();
    const em = email.trim();
    if (!n) {
      setFormMsg("이름을 입력해 주세요.");
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

    const emailRecipients: { name: string; email: string }[] = [];
    for (const r of selectedRows) {
      const em = normalizeRecipientEmail(r.email);
      if (em) {
        emailRecipients.push({
          name: (r.name ?? "").trim() || "학생",
          email: em,
        });
      }
    }

    setDispatching(true);
    setDispatchMsg(null);
    try {
      if (emailJsReady && emailRecipients.length > 0) {
        await sendHomeworkEmailsSequential({
          recipients: emailRecipients,
          homeworkCode: resolveHomeworkCodeForMessage(),
          message: msg,
        });
      }

      await addDoc(collection(db, "homework_dispatches"), {
        teacherId: firebaseUser.uid,
        homeworkCode: code,
        message: msg,
        recipientStudentIds: selectedRows.map((r) => r.id),
        recipients: selectedRows.map((r) => ({
          studentId: r.id,
          name: r.name,
          email: String(r.email ?? "").trim(),
          phone: r.phone,
        })),
        createdAt: serverTimestamp(),
      });

      setSendOpen(false);
      setHomeworkSelect("");
      setHomeworkCodeCustom("");
      setDispatchMessage("");
      let ok = "과제 안내 기록이 저장되었습니다.";
      if (emailJsReady) {
        if (emailRecipients.length > 0) {
          ok += ` 이메일 ${emailRecipients.length}건을 발송했습니다.`;
        } else {
          ok += " (등록된 이메일이 없어 메일은 발송하지 않았습니다.)";
        }
      }
      setFormMsg(ok);
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
    const em = editEmail.trim();
    if (!n) {
      setEditMsg("이름을 입력해 주세요.");
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

  function openSendModal(forStudentId?: string) {
    setDispatchMsg(null);
    if (forStudentId !== undefined) {
      setSelected(new Set([forStudentId]));
    }
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
            이메일 발송을 위해 <code>.env.local</code>에 <code>VITE_EMAILJS_PUBLIC_KEY</code>,{" "}
            <code>VITE_EMAILJS_SERVICE_ID</code>, <code>VITE_EMAILJS_TEMPLATE_ID</code> 세 변수를 모두
            넣은 뒤 서버를 재시작하세요. 템플릿 수신자(To)에는 <code>{"{{email}}"}</code>를 사용합니다.
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
              Save contacts, send homework emails (EmailJS), and open SMS with prefilled text.
            </span>
            <span className="crm-section__lead-ko">
              이름·연락처를 저장하고, 선택한 학생에게 과제 안내 이메일을 보내거나 Firestore에 기록합니다.
              전화번호가 있으면 문자 앱 연결도 사용할 수 있습니다.
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
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="student@example.com"
              autoComplete="off"
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
          onClick={() => openSendModal()}
        >
          <span className="ui-en">Homework notify</span>
          <span className="ui-ko">과제 알림</span>
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
                  <div className="crm-list__name-row">
                    <span className="crm-list__name">{r.name}</span>
                    <div className="crm-list__notify">
                      <button
                        type="button"
                        className="crm-notify-btn"
                        disabled={!emailJsReady || !normalizeRecipientEmail(r.email)}
                        title={
                          !emailJsReady
                            ? "EmailJS 환경 변수를 설정해 주세요."
                            : !normalizeRecipientEmail(r.email)
                              ? "유효한 이메일이 없습니다."
                              : "이 학생만 선택해 과제 알림 모달을 엽니다."
                        }
                        onClick={() => openSendModal(r.id)}
                      >
                        메일 발송
                      </button>
                      <button
                        type="button"
                        className="crm-notify-btn crm-notify-btn--sms"
                        disabled={!normalizeSmsDialString(r.phone)}
                        title={
                          !normalizeSmsDialString(r.phone)
                            ? "전화번호가 없거나 형식이 올바르지 않습니다."
                            : "과제·메시지 입력 후 모달에서 문자 앱을 엽니다."
                        }
                        onClick={() => openSendModal(r.id)}
                      >
                        문자 발송
                      </button>
                    </div>
                  </div>
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
            />
            <h3 id="crm-send-title" className="crm-modal__title">
              <span className="crm-modal__title-en">Homework notification</span>
              <span className="crm-modal__title-ko">과제 알림</span>
            </h3>
            <p className="crm-modal__hint">
              선택 <strong>{selectedRows.length}</strong>명: 이메일이 등록된 학생에게는 EmailJS로 순차 발송
              (수신 변수 <code>email</code>), 이후 <code>homework_dispatches</code>에 기록합니다. 전체
              선택 후 이 화면에서 제출하면 <strong>대량 이메일</strong>이 동일하게 동작합니다.
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
                    placeholder="예: HW-… 또는 안내용 코드"
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
              {selectedRows.length === 1 && normalizeSmsDialString(selectedRows[0].phone) && (
                <div className="crm-modal__sms">
                  <span className="crm-modal__sms-text">
                    한 명만 선택된 경우, 과제번호·안내 메시지를 입력한 뒤 휴대폰 문자 앱을 열 수 있습니다.
                  </span>
                  {smsHrefInModal ? (
                    <a className="crm-sms-open" href={smsHrefInModal}>
                      문자앱열기(휴대폰만 가능)
                    </a>
                  ) : (
                    <span className="crm-sms-open crm-sms-open--placeholder" role="note">
                      문자앱열기(휴대폰만 가능)
                    </span>
                  )}
                </div>
              )}
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
                <button type="submit" className="btn btn--primary" disabled={dispatching}>
                  {dispatching
                    ? "처리 중…"
                    : emailJsReady
                      ? "기록 저장 · 이메일 발송"
                      : "기록 저장"}
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
                  type="text"
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
