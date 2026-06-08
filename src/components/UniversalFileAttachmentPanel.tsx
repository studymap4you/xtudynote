import { DragEvent, ReactNode, useRef, useState } from "react";
import styles from "@/components/universalFileAttachmentPanel.module.css";

export type UniversalAttachmentItem = {
  id: string;
  file: File;
};

type UniversalFileAttachmentPanelProps = {
  title: string;
  description: string;
  items: UniversalAttachmentItem[];
  onChange: (items: UniversalAttachmentItem[]) => void;
  disabled?: boolean;
  addLabel?: string;
  emptyLabel?: string;
  renderItemAction?: (item: UniversalAttachmentItem) => ReactNode;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAttachmentId(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2)}`;
}

function normalizeFiles(files: FileList | File[] | null): UniversalAttachmentItem[] {
  if (!files) return [];
  return Array.from(files).map((file) => ({
    id: buildAttachmentId(file),
    file,
  }));
}

export function UniversalFileAttachmentPanel({
  title,
  description,
  items,
  onChange,
  disabled = false,
  addLabel = "파일 추가",
  emptyLabel = "아직 추가된 파일이 없습니다.",
  renderItemAction,
}: UniversalFileAttachmentPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function appendFiles(files: FileList | File[] | null) {
    const next = normalizeFiles(files);
    if (next.length === 0) return;
    onChange([...items, ...next]);
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    appendFiles(event.dataTransfer.files);
  }

  return (
    <section className={styles.panel} aria-label={title}>
      <div className={styles.header}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <button type="button" className={styles.addButton} disabled={disabled} onClick={() => inputRef.current?.click()}>
          {addLabel}
        </button>
      </div>

      <div
        className={`${styles.dropZone}${isDragging ? ` ${styles.dropZoneActive}` : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <strong>Drop files here</strong>
        <span>모든 파일 형식을 추가할 수 있습니다.</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className={styles.fileInput}
        disabled={disabled}
        onChange={(event) => {
          appendFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {items.length > 0 ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.item}>
              <div className={styles.itemMain}>
                <span className={styles.fileName}>{item.file.name}</span>
                <span className={styles.fileMeta}>
                  {item.file.type || "unknown file type"} · {formatBytes(item.file.size)}
                </span>
              </div>
              <div className={styles.itemActions}>
                {renderItemAction?.(item)}
                <button type="button" className={styles.removeButton} disabled={disabled} onClick={() => removeItem(item.id)}>
                  제거
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{emptyLabel}</p>
      )}
    </section>
  );
}
