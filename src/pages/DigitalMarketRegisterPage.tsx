import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { isEmptyRichText } from "@/lib/richTextUtils";
import { addDigitalMarketProduct, uploadDigitalMarketImage } from "@/lib/market/digitalMarketApi";
import type { DigitalMarketProductDoc } from "@/types/digitalMarketProduct";
import styles from "@/pages/videoCatalog.module.css";

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function DigitalMarketRegisterPage() {
  const { firebaseUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const uid = firebaseUser?.uid ?? "";

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");
  const [fulfillmentType, setFulfillmentType] =
    useState<DigitalMarketProductDoc["fulfillmentType"]>("download");
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!uid) return;
      const t = title.trim();
      const pu = purchaseUrl.trim();
      if (!t) {
        setFormMsg("제목을 입력해 주세요.");
        return;
      }
      if (isEmptyRichText(descriptionHtml)) {
        setFormMsg("상세 설명(본문)을 입력해 주세요.");
        return;
      }
      if (!isHttpUrl(pu)) {
        setFormMsg("구매·신청 링크는 http(s):// 로 시작하는 전체 URL이어야 합니다.");
        return;
      }

      let imageUrl: string;
      if (imageFile) {
        try {
          imageUrl = await uploadDigitalMarketImage(uid, imageFile);
        } catch (err) {
          setFormMsg(err instanceof Error ? err.message : String(err));
          return;
        }
      } else {
        const raw = imageUrlInput.trim();
        if (!raw || !isHttpUrl(raw)) {
          setFormMsg("대표 이미지를 파일로 업로드하거나, 이미지 URL을 입력해 주세요.");
          return;
        }
        imageUrl = raw;
      }

      setBusy(true);
      setFormMsg(null);
      try {
        await addDigitalMarketProduct({
          title: t,
          summary: summary.trim(),
          descriptionHtml,
          imageUrl,
          purchaseUrl: pu,
          fulfillmentType,
          createdBy: uid,
        });
        showToast("ok", "디지털마켓 상품이 등록되었습니다.");
        navigate("/digital-market", { replace: true });
      } catch (err) {
        setFormMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [uid, title, summary, descriptionHtml, purchaseUrl, fulfillmentType, imageFile, imageUrlInput, showToast, navigate],
  );

  return (
    <PublicShell light>
      <main className={styles.wrap}>
        <nav className={styles.registerNav}>
          <Link to="/digital-market" className={styles.registerBack}>
            ← 디지털마켓
          </Link>
        </nav>
        <header className={styles.registerHeader}>
          <h1 className={styles.registerH1}>디지털마켓 상품 등록</h1>
          <p className={styles.lead}>
            카드·이미지·본문 영역을 클릭하면 연결될 <strong>구매·신청 URL</strong>을 넣습니다. 다운로드형과 이메일 배송형을
            구분해 표시합니다.
          </p>
        </header>

        <form className={styles.registerCardWide} onSubmit={(e) => void onSubmit(e)}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="dm-title">
              제목
            </label>
            <input
              id="dm-title"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="dm-summary">
              짧은 요약 (카드에 표시)
            </label>
            <input
              id="dm-summary"
              className={styles.input}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="한 줄 소개"
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>이행 방식</span>
            <select
              className={styles.input}
              value={fulfillmentType}
              onChange={(e) =>
                setFulfillmentType(e.target.value === "email" ? "email" : "download")
              }
            >
              <option value="download">다운로드</option>
              <option value="email">이메일 배송</option>
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="dm-purchase">
              구매·신청 링크 (필수)
            </label>
            <input
              id="dm-purchase"
              className={styles.input}
              type="url"
              value={purchaseUrl}
              onChange={(e) => setPurchaseUrl(e.target.value)}
              placeholder="https://…"
              required
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="dm-img-file">
              대표 이미지 (파일 업로드)
            </label>
            <input
              id="dm-img-file"
              type="file"
              accept="image/*"
              className={styles.fileInput}
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            <p className={styles.fieldHint}>또는 아래에 이미지 URL을 직접 입력할 수 있습니다.</p>
            <input
              className={styles.input}
              style={{ marginTop: "0.35rem" }}
              type="url"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              placeholder="https://… (이미지 주소)"
              autoComplete="off"
              disabled={!!imageFile}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>상세 설명 (리치 텍스트)</span>
            <RichTextEditor
              value={descriptionHtml}
              onChange={setDescriptionHtml}
              userId={uid}
              placeholder="상품 설명, 포함 파일 안내, 이메일 배송 시 유의사항 등"
            />
          </div>

          {formMsg ? <p className={styles.err}>{formMsg}</p> : null}

          <div className={styles.registerActions}>
            <button type="submit" className="btn btn--primary btn--stack" disabled={busy}>
              {busy ? "저장 중…" : "등록"}
            </button>
            <Link to="/digital-market" className="btn btn--ghost btn--stack">
              취소
            </Link>
          </div>
        </form>
      </main>
    </PublicShell>
  );
}
