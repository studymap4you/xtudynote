import { useCallback, useEffect, useState } from "react";
import type { EnglishVocabPair } from "@/types/englishPassageLab";
import styles from "@/pages/english-passage/englishPassageLab.module.css";

type Props = {
  open: boolean;
  initialItems: EnglishVocabPair[];
  onClose: () => void;
  /** 최종 확정 시에만 호출 — 부모에서 토스트 처리 */
  onFinalize: (items: EnglishVocabPair[]) => void;
};

export function EnglishVocabReviewModal({ open, initialItems, onClose, onFinalize }: Props) {
  const [rows, setRows] = useState<EnglishVocabPair[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRows(initialItems.map((r) => ({ ...r })));
      setEditingId(null);
    }
  }, [open, initialItems]);

  const removeRow = useCallback((id: string) => {
    setBusyAction(`del-${id}`);
    setRows((rs) => rs.filter((r) => r.id !== id));
    window.setTimeout(() => setBusyAction(null), 180);
  }, []);

  const addRow = useCallback(() => {
    setBusyAction("add");
    setRows((rs) => [
      ...rs,
      { id: crypto.randomUUID(), word: "", meaning: "" },
    ]);
    window.setTimeout(() => setBusyAction(null), 180);
  }, []);

  const patchRow = useCallback((id: string, patch: Partial<EnglishVocabPair>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const handleFinalize = useCallback(() => {
    const cleaned = rows
      .map((r) => ({
        ...r,
        word: r.word.trim(),
        meaning: r.meaning.trim(),
      }))
      .filter((r) => r.word.length > 0 && r.meaning.length > 0);
    if (cleaned.length === 0) {
      return;
    }
    setBusyAction("finalize");
    onFinalize(cleaned);
    window.setTimeout(() => setBusyAction(null), 220);
  }, [onFinalize, rows]);

  if (!open) return null;

  return (
    <div className={styles.modalBackdrop} role="presentation" onClick={() => onClose()}>
      <div
        className={styles.modalCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vocab-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.modalHead}>
          <div>
            <h2 id="vocab-modal-title" className={styles.modalTitle}>
              단어 검토 및 편집
            </h2>
            <p className={styles.modalSub}>
              단어를 삭제·추가하고 뜻을 수정한 뒤 <strong>최종 확정</strong>을 눌러 주세요.
            </p>
          </div>
          <button type="button" className={styles.modalIconBtn} onClick={() => onClose()}>
            ✕
          </button>
        </header>

        <div className={styles.modalToolbar}>
          <button
            type="button"
            className={`${styles.btnGhost} ${busyAction === "add" ? styles.btnPulse : ""}`}
            onClick={addRow}
          >
            + 단어 추가
          </button>
        </div>

        <div className={styles.modalTableWrap}>
          <table className={styles.zebraTable}>
            <thead>
              <tr>
                <th className={styles.thWord}>영단어</th>
                <th className={styles.thMean}>뜻</th>
                <th className={styles.thAct} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.id}
                  className={idx % 2 === 0 ? styles.trEven : styles.trOdd}
                >
                  <td>
                    <input
                      className={styles.tableInput}
                      value={r.word}
                      onChange={(e) => patchRow(r.id, { word: e.target.value })}
                      placeholder="word"
                      aria-label="영단어"
                    />
                  </td>
                  <td
                    className={styles.meaningCell}
                    onClick={() => setEditingId(r.id)}
                  >
                    {editingId === r.id ? (
                      <input
                        className={styles.tableInput}
                        value={r.meaning}
                        onChange={(e) => patchRow(r.id, { meaning: e.target.value })}
                        onBlur={() => setEditingId(null)}
                        autoFocus
                        aria-label="뜻 편집"
                      />
                    ) : (
                      <button
                        type="button"
                        className={styles.inlineMeanBtn}
                        title="클릭하여 뜻 수정"
                      >
                        {r.meaning || "(뜻 입력)"}
                      </button>
                    )}
                  </td>
                  <td className={styles.actCell}>
                    <button
                      type="button"
                      className={`${styles.btnDangerSm} ${busyAction === `del-${r.id}` ? styles.btnPulse : ""}`}
                      onClick={() => removeRow(r.id)}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className={styles.modalEmpty}>표시할 단어가 없습니다. 단어를 추가해 주세요.</p>
          )}
        </div>

        <footer className={styles.modalFoot}>
          <button type="button" className={styles.btnGhost} onClick={() => onClose()}>
            취소
          </button>
          <button
            type="button"
            className={`${styles.btnPrimary} ${busyAction === "finalize" ? styles.btnPulse : ""}`}
            disabled={rows.every((r) => !r.word.trim() || !r.meaning.trim())}
            onClick={handleFinalize}
          >
            최종 확정
          </button>
        </footer>
      </div>
    </div>
  );
}
