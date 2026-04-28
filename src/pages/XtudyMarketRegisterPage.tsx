import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { isEmptyRichText } from "@/lib/richTextUtils";
import { MarketRegisterImagePreview } from "@/components/market/MarketRegisterImagePreview";
import { addXtudyMarketProduct, uploadXtudyMarketImage } from "@/lib/market/xtudyMarketApi";
import "@/pages/pages.css";

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
        navigate("/admin/storefront?tab=xtudy", { replace: true });
      } catch (err) {
        setFormMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [uid, title, detailHtml, purchaseUrl, imageFile, imageUrlInput, showToast, navigate],
  );

  return (
    <DashboardShell light>
      <main className="admin-layout admin-layout--light material-register classroom-hub classroom-hub--manage video-register-page">
        <div className="classroom-hub__shell">
          <div className="classroom-hub__hero-card">
            <Link to="/admin/storefront?tab=xtudy" className="material-register__text-link" style={{ fontSize: "0.9rem" }}>
              ← 스토어 관리
            </Link>
            <div className="admin-layout__title-row">
              <h1>엑스터디마켓 상품 등록</h1>
              <span className="ui-ko material-register__subtitle-bi">
                <span className="reg-form__label-en" style={{ display: "block", fontWeight: 700 }}>
                  Xtudy market listing
                </span>
                <span className="reg-form__label-ko" style={{ display: "block", marginTop: "0.25rem" }}>
                  대표 이미지·상세 설명을 등록합니다. 저장 후 만들어지는 <strong>상세 페이지 URL</strong>을 공유 링크로 쓸 수
                  있습니다.
                </span>
              </span>
            </div>
          </div>

          <div className="classroom-hub__callout classroom-hub__callout--info video-register-page__notice">
            <strong>구매·외부 링크</strong>는 실제 결제·상품 페이지로 연결됩니다. 이미지는 Storage에 올리거나 공개
            https 이미지 URL을 사용할 수 있습니다.
          </div>

          {!firebaseUser ? <p className="auth-error">로그인이 필요합니다.</p> : null}

          {firebaseUser ? (
            <div className="classroom-hub__panel classroom-hub__panel--manage video-register-page__panel">
              <form
                className="video-register-page__form material-register-form__grid"
                onSubmit={(e) => void onSubmit(e)}
              >
                {formMsg ? <p className="auth-error">{formMsg}</p> : null}

                <div className="classroom-hub__card">
                  <h3 className="classroom-hub__card-title">상품 기본 정보</h3>
                  <label className="reg-form__field" htmlFor="xm-title">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Product title</span>
                      <span className="reg-form__label-ko">상품명</span>
                    </span>
                    <input
                      id="xm-title"
                      className="add-passage__control material-register-form__input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      autoComplete="off"
                    />
                  </label>
                  <label className="reg-form__field" htmlFor="xm-purchase">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Purchase / external URL</span>
                      <span className="reg-form__label-ko">구매·외부 상품 링크</span>
                    </span>
                    <input
                      id="xm-purchase"
                      className="add-passage__control material-register-form__input"
                      type="url"
                      inputMode="url"
                      value={purchaseUrl}
                      onChange={(e) => setPurchaseUrl(e.target.value)}
                      placeholder="https://…"
                      required
                      autoComplete="off"
                    />
                  </label>
                </div>

                <div className="classroom-hub__card classroom-hub__card--soft">
                  <h3 className="classroom-hub__card-title">대표 이미지</h3>
                  <div className="market-register-image-row">
                    <div className="market-register-image-row__fields">
                      <label className="reg-form__field" htmlFor="xm-img-file">
                        <span className="reg-form__label-line">
                          <span className="reg-form__label-en">Image file</span>
                          <span className="reg-form__label-ko">파일 업로드</span>
                        </span>
                        <input
                          id="xm-img-file"
                          type="file"
                          accept="image/*"
                          className="add-passage__control add-passage__control--file video-register-page__file"
                          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <label className="reg-form__field" htmlFor="xm-img-url">
                        <span className="reg-form__label-line">
                          <span className="reg-form__label-en">Or image URL</span>
                          <span className="reg-form__label-ko">또는 이미지 URL</span>
                        </span>
                        <input
                          id="xm-img-url"
                          className="add-passage__control material-register-form__input"
                          type="url"
                          inputMode="url"
                          value={imageUrlInput}
                          onChange={(e) => setImageUrlInput(e.target.value)}
                          placeholder="https://…"
                          autoComplete="off"
                          disabled={!!imageFile}
                        />
                      </label>
                    </div>
                    <MarketRegisterImagePreview
                      imageFile={imageFile}
                      imageUrlInput={imageUrlInput}
                      purchaseUrl={purchaseUrl}
                    />
                  </div>
                </div>

                <div className="classroom-hub__card">
                  <h3 className="classroom-hub__card-title">상품 상세 설명</h3>
                  <div className="reg-form__field material-register-form__field-rich">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Description</span>
                      <span className="reg-form__label-ko">본문</span>
                    </span>
                    <p className="material-register-form__rich-hint">서식·링크·이미지 삽입 가능합니다.</p>
                    <RichTextEditor
                      value={detailHtml}
                      onChange={setDetailHtml}
                      userId={uid}
                      placeholder="스펙, 구성, 배송·환불 안내 등"
                    />
                  </div>
                </div>

                <div className="classroom-hub__card classroom-hub__card--actions">
                  <button type="submit" className="btn btn--primary btn--stack video-register-page__submit" disabled={busy}>
                    <span className="ui-en">{busy ? "Saving…" : "Save & open detail"}</span>
                    <span className="ui-ko">{busy ? "저장 중…" : "등록하고 상세 페이지로 이동"}</span>
                  </button>
                  <Link to="/admin/storefront?tab=xtudy" className="btn btn--ghost btn--stack" style={{ marginTop: "0.65rem" }}>
                    취소
                  </Link>
                </div>
              </form>

              <div className="video-register-page__back">
                <Link to="/dashboard" className="btn btn--ghost btn--stack">
                  ← 대시보드
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </DashboardShell>
  );
}
