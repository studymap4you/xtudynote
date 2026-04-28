import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PublicShell } from "@/components/PublicShell";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { isEmptyRichText } from "@/lib/richTextUtils";
import { addXtudyMarketProduct, uploadXtudyMarketImage } from "@/lib/market/xtudyMarketApi";
import styles from "@/pages/videoCatalog.module.css";

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function XtudyMarketRegisterPage() {
  const { firebaseUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const uid = firebaseUser?.uid ?? "";

  const [title, setTitle] = useState("");
  const [detailHtml, setDetailHtml] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");
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
      if (isEmptyRichText(detailHtml)) {
        setFormMsg("상품 상세 설명을 입력해 주세요.");
        return;
      }
      if (!isHttpUrl(pu)) {
        setFormMsg("구매 링크는 http(s):// 로 시작하는 전체 URL이어야 합니다.");
        return;
      }

      let imageUrl: string;
      if (imageFile) {
        try {
          imageUrl = await uploadXtudyMarketImage(uid, imageFile);
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
        const newId = await addXtudyMarketProduct({
          title: t,
          detailHtml,
          imageUrl,
          purchaseUrl: pu,
          createdBy: uid,
        });
        const share = `${window.location.origin}/xtudy-market/p/${newId}`;
        try {
          await navigator.clipboard.writeText(share);
          showToast("ok", "등록되었습니다. 공유 링크를 클립보드에 복사했습니다.");
        } catch {
          showToast("ok", "등록되었습니다. 상세 페이지에서 링크를 복사할 수 있습니다.");
        }
        navigate(`/xtudy-market/p/${newId}`, { replace: true });
      } catch (err) {
        setFormMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [uid, title, detailHtml, purchaseUrl, imageFile, imageUrlInput, showToast, navigate],
  );

  return (
    <PublicShell light>
      <main className={styles.wrap}>
        <nav className={styles.registerNav}>
          <Link to="/xtudy-market" className={styles.registerBack}>
            ← 엑스터디마켓
          </Link>
        </nav>
        <header className={styles.registerHeader}>
          <h1 className={styles.registerH1}>엑스터디마켓 상품 등록</h1>
          <p className={styles.lead}>
            대표 이미지와 상세 설명을 등록합니다. 저장 후 생성되는 <strong>상세 페이지 주소</strong>를 그대로 공유 링크로
            쓸 수 있습니다.
          </p>
        </header>

        <form className={styles.registerCardWide} onSubmit={(e) => void onSubmit(e)}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="xm-title">
              상품명
            </label>
            <input
              id="xm-title"
              className={styles.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoComplete="off"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="xm-purchase">
              구매·외부 상품 링크
            </label>
            <input
              id="xm-purchase"
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
            <label className={styles.label} htmlFor="xm-img-file">
              대표 이미지
            </label>
            <input
              id="xm-img-file"
              type="file"
              accept="image/*"
              className={styles.fileInput}
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            <p className={styles.fieldHint}>또는 이미지 URL</p>
            <input
              className={styles.input}
              style={{ marginTop: "0.35rem" }}
              type="url"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              placeholder="https://…"
              autoComplete="off"
              disabled={!!imageFile}
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>상품 상세 설명</span>
            <RichTextEditor
              value={detailHtml}
              onChange={setDetailHtml}
              userId={uid}
              placeholder="스펙, 구성, 배송·환불 안내 등"
            />
          </div>

          {formMsg ? <p className={styles.err}>{formMsg}</p> : null}

          <div className={styles.registerActions}>
            <button type="submit" className="btn btn--primary btn--stack" disabled={busy}>
              {busy ? "저장 중…" : "등록하고 상세 페이지로 이동"}
            </button>
            <Link to="/xtudy-market" className="btn btn--ghost btn--stack">
              취소
            </Link>
          </div>
        </form>
      </main>
    </PublicShell>
  );
}
