import { File, FileImage, FileSpreadsheet, FileText, FileType2, GripVertical, Trash2 } from "lucide-react";
import "@/components/description-asset-queue.css";

export type QueuedAsset = { id: string; file: File };

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function FileKindIcon({ name }: { name: string }) {
  const ext = extOf(name);
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "avif", "heic"].includes(ext)) {
    return <FileImage className="desc-asset-queue__icon" aria-hidden size={22} strokeWidth={1.75} />;
  }
  if (ext === "pdf") {
    return <FileText className="desc-asset-queue__icon desc-asset-queue__icon--pdf" aria-hidden size={22} strokeWidth={1.75} />;
  }
  if (["doc", "docx", "hwp"].includes(ext)) {
    return <FileType2 className="desc-asset-queue__icon" aria-hidden size={22} strokeWidth={1.75} />;
  }
  if (["xls", "xlsx", "csv"].includes(ext)) {
    return <FileSpreadsheet className="desc-asset-queue__icon" aria-hidden size={22} strokeWidth={1.75} />;
  }
  return <File className="desc-asset-queue__icon" aria-hidden size={22} strokeWidth={1.75} />;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  items: QueuedAsset[];
  disabled?: boolean;
  onAddFiles: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, delta: -1 | 1) => void;
  onInsertToDescription: () => void;
  insertBusy?: boolean;
  insertProgress?: number | null;
};

export function DescriptionAssetQueue({
  items,
  disabled,
  onAddFiles,
  onRemove,
  onMove,
  onInsertToDescription,
  insertBusy,
  insertProgress,
}: Props) {
  return (
    <div className="desc-asset-queue">
      <div className="desc-asset-queue__head">
        <span className="desc-asset-queue__title-en">Description assets</span>
        <span className="desc-asset-queue__title-ko">상세 설명용 이미지·파일 (다중 선택)</span>
      </div>
      <p className="desc-asset-queue__hint">
        여러 파일을 한 번에 고른 뒤, 순서를 바꾸거나 삭제할 수 있습니다.「설명에 삽입」이면 이미지는 본문에 넣고, 그 외는
        다운로드 링크 단락으로 넣습니다.
      </p>
      <div className="desc-asset-queue__actions">
        <label className="btn btn--ghost desc-asset-queue__file-label">
          <span className="ui-ko">파일 추가 (다중)</span>
          <input
            type="file"
            multiple
            className="desc-asset-queue__file-input"
            disabled={disabled || insertBusy}
            onChange={(e) => {
              const list = e.target.files;
              if (list?.length) onAddFiles(Array.from(list));
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn--primary desc-asset-queue__insert-btn"
          disabled={disabled || insertBusy || items.length === 0}
          onClick={() => onInsertToDescription()}
        >
          {insertBusy ? "업로드·삽입 중…" : "선택 항목 설명에 삽입"}
        </button>
      </div>
      {insertProgress != null && insertBusy ? (
        <div className="desc-asset-queue__progress" role="progressbar" aria-valuenow={insertProgress} aria-valuemin={0} aria-valuemax={100}>
          <div className="desc-asset-queue__progress-bar" style={{ width: `${insertProgress}%` }} />
          <span className="desc-asset-queue__progress-label">{insertProgress}%</span>
        </div>
      ) : null}
      {items.length === 0 ? (
        <p className="desc-asset-queue__empty">아직 대기 중인 파일이 없습니다.</p>
      ) : (
        <ul className="desc-asset-queue__list">
          {items.map((it, index) => (
            <li key={it.id} className="desc-asset-queue__item">
              <span className="desc-asset-queue__grip" aria-hidden>
                <GripVertical size={18} strokeWidth={1.75} />
              </span>
              <FileKindIcon name={it.file.name} />
              <div className="desc-asset-queue__meta">
                <span className="desc-asset-queue__name">{it.file.name}</span>
                <span className="desc-asset-queue__size">{formatBytes(it.file.size)}</span>
              </div>
              <div className="desc-asset-queue__row-actions">
                <button
                  type="button"
                  className="desc-asset-queue__icon-btn"
                  title="위로"
                  disabled={disabled || insertBusy || index === 0}
                  onClick={() => onMove(it.id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="desc-asset-queue__icon-btn"
                  title="아래로"
                  disabled={disabled || insertBusy || index === items.length - 1}
                  onClick={() => onMove(it.id, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="desc-asset-queue__icon-btn desc-asset-queue__icon-btn--danger"
                  title="제거"
                  disabled={disabled || insertBusy}
                  onClick={() => onRemove(it.id)}
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
