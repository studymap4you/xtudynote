import { useCallback, useRef, useState } from "react";
import { parseContactRosterFile } from "@/lib/worksheet/parseStudentRosterFile";
import { lookupStudentByEmail } from "@/lib/worksheet/worksheetOutreachCalls";
import type { OutreachRecipientInput } from "@/lib/worksheet/worksheetOutreachCalls";
import styles from "@/pages/assignments/worksheetDistribution.module.css";

export type RecipientDraft = OutreachRecipientInput & {
  id: string;
  /** null = 확인 전, true = 가입됨, false = 미가입 */
  registered: boolean | null;
};

type Props = {
  rows: RecipientDraft[];
  onChangeRows: (rows: RecipientDraft[]) => void;
  disabled?: boolean;
};

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `r_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function DistributionRecipientsPanel({ rows, onChangeRows, disabled }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addRow = useCallback(async () => {
    const dn = displayName.trim();
    const ph = phone.trim();
    const em = email.trim().toLowerCase();
    if (!dn && !ph && !em) return;
    if (em && !em.includes("@")) {
      window.alert("이메일 형식을 확인해 주세요.");
      return;
    }
    let registered: boolean | null = null;
    if (em) {
      setBusy(true);
      try {
        const r = await lookupStudentByEmail(em);
        registered = r.registered;
      } catch {
        registered = null;
      } finally {
        setBusy(false);
      }
    }
    onChangeRows([
      ...rows,
      {
        id: newId(),
        displayName: dn,
        phone: ph,
        email: em,
        registered,
      },
    ]);
    setDisplayName("");
    setPhone("");
    setEmail("");
  }, [displayName, phone, email, rows, onChangeRows]);

  const removeRow = (id: string) => {
    onChangeRows(rows.filter((r) => r.id !== id));
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const parsed = await parseContactRosterFile(f);
      const next = [...rows];
      for (const p of parsed) {
        let registered: boolean | null = null;
        if (p.email) {
          try {
            const r = await lookupStudentByEmail(p.email);
            registered = r.registered;
          } catch {
            registered = null;
          }
        }
        next.push({
          id: newId(),
          displayName: p.displayName,
          phone: p.phone,
          email: p.email,
          registered,
        });
      }
      onChangeRows(next);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.panel} aria-label="외부 이메일 수신자">
      <h2 className={styles.title}>외부 이메일 수신자</h2>
      <p className={styles.sub}>
        이름·전화·이메일을 입력하거나 CSV/엑셀을 불러오세요. 이메일이 Firebase 계정과 일치하면 <strong>가입</strong>으로
        표시되며 과제함에도 반영됩니다. <strong>미가입</strong> 이메일에는 학습지 링크 안내 메일이 발송됩니다. (실제 발송은
        Cloud Functions + SMTP)
      </p>

      <div className={styles.toolbar}>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(ev) => void onPickFile(ev)} />
        <button type="button" className={styles.fileBtn} disabled={disabled || busy} onClick={() => fileRef.current?.click()}>
          엑셀/CSV로 명단 불러오기
        </button>
      </div>

      <div className={styles.formRow}>
        <div className={styles.field} style={{ flex: "1 1 140px" }}>
          <label htmlFor="dist-name">이름(별명)</label>
          <input
            id="dist-name"
            className={`${styles.input} ${styles.inputGrow}`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={120}
            disabled={disabled}
            placeholder="홍길동"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="dist-phone">전화번호</label>
          <input
            id="dist-phone"
            className={`${styles.input} ${styles.inputMid}`}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
            disabled={disabled}
            placeholder="010-0000-0000"
          />
        </div>
        <div className={styles.field} style={{ flex: "1 1 200px" }}>
          <label htmlFor="dist-email">이메일</label>
          <input
            id="dist-email"
            className={`${styles.input} ${styles.inputGrow}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
            disabled={disabled}
            placeholder="student@example.com"
          />
        </div>
        <button type="button" className={styles.addBtn} disabled={disabled || busy} onClick={() => void addRow()}>
          {busy ? "확인 중…" : "추가"}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>아래 목록이 비어 있습니다. 위에서 학생을 추가하거나 파일을 불러오세요.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>이름(별명)</th>
              <th>전화</th>
              <th>이메일</th>
              <th>가입 여부</th>
              <th aria-label="삭제" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.displayName || "—"}</td>
                <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}>{r.phone || "—"}</td>
                <td style={{ wordBreak: "break-all" }}>{r.email || "—"}</td>
                <td>
                  {!r.email ? (
                    <span className={styles.regDash}>—</span>
                  ) : r.registered === true ? (
                    <span className={`${styles.badge} ${styles.badgeOk}`}>가입</span>
                  ) : r.registered === false ? (
                    <span className={`${styles.badge} ${styles.badgeNo}`}>미가입</span>
                  ) : (
                    <span className={styles.regDash} title="이메일 가입 여부를 확인하지 못했습니다.">
                      —
                    </span>
                  )}
                </td>
                <td>
                  <button type="button" className={styles.rm} aria-label="행 삭제" disabled={disabled} onClick={() => removeRow(r.id)}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className={styles.note}>
        전화번호·이메일은 담당 선생님과 마스터 관리자만 Firestore에서 조회할 수 있도록 규칙이 제한되어 있습니다.
      </p>
    </section>
  );
}
