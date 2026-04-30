import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { RichTextEditor } from "@/components/RichTextEditor";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { isEmptyRichText } from "@/lib/richTextUtils";
import { MarketRegisterImagePreview } from "@/components/market/MarketRegisterImagePreview";
import {
  addDigitalMarketProduct,
  getDigitalMarketProduct,
  updateDigitalMarketProduct,
  uploadDigitalMarketImage,
} from "@/lib/market/digitalMarketApi";
import type { DigitalMarketProductDoc } from "@/types/digitalMarketProduct";
import { parseTuitionKrwInput } from "@/lib/formatTuitionKrw";
import "@/pages/pages.css";

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function DigitalMarketRegisterPage() {
  const { productId } = useParams<{ productId: string }>();
  const isEdit = Boolean(productId);
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
  const [priceKrwInput, setPriceKrwInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [loadBusy, setLoadBusy] = useState(isEdit);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!productId || !firebaseUser) {
      setLoadBusy(false);
      return;
    }
    let cancelled = false;
    setLoadBusy(true);
    setLoadErr(null);
    void (async () => {
      try {
        const row = await getDigitalMarketProduct(productId);
        if (cancelled) return;
        if (!row) {
          setLoadErr("상품을 찾을 수 없습니다.");
          setLoadBusy(false);
          return;
        }
        if (row.data.createdBy !== firebaseUser.uid) {
          setLoadErr("이 상품을 수정할 권한이 없습니다.");
          setLoadBusy(false);
          return;
        }
        setTitle(row.data.title ?? "");
        setSummary(row.data.summary ?? "");
        setDescriptionHtml(row.data.descriptionHtml ?? "");
        setPurchaseUrl(row.data.purchaseUrl ?? "");
        setFulfillmentType(row.data.fulfillmentType === "email" ? "email" : "download");
        setImageUrlInput(row.data.imageUrl ?? "");
        setImageFile(null);
        setPriceKrwInput(
          typeof row.data.priceKrw === "number" && row.data.priceKrw >= 1
            ? String(row.data.priceKrw)
            : "",
        );
      } catch (e) {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, firebaseUser]);

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

      const priceKrw = parseTuitionKrwInput(priceKrwInput);
      if (priceKrw == null) {
        setFormMsg("판매 가격(원)을 1원 이상으로 입력해 주세요.");
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
        if (isEdit && productId) {
          await updateDigitalMarketProduct(productId, {
            title: t,
            summary: summary.trim(),
            descriptionHtml,
            imageUrl,
            purchaseUrl: pu,
            fulfillmentType,
            priceKrw,
          });
          showToast("ok", "디지털마켓 상품이 수정되었습니다.");
        } else {
          await addDigitalMarketProduct({
            title: t,
            summary: summary.trim(),
            descriptionHtml,
            imageUrl,
            purchaseUrl: pu,
            fulfillmentType,
            priceKrw,
            createdBy: uid,
          });
          showToast("ok", "디지털마켓 상품이 등록되었습니다.");
        }
        navigate("/admin/storefront?tab=digital", { replace: true });
      } catch (err) {
        setFormMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [
      uid,
      productId,
      isEdit,
      title,
      summary,
      descriptionHtml,
      purchaseUrl,
      fulfillmentType,
      imageFile,
      imageUrlInput,
      priceKrwInput,
      showToast,
      navigate,
    ],
  );

  return (
    <DashboardShell light>
      <main className="admin-layout admin-layout--light material-register classroom-hub classroom-hub--manage video-register-page">
        <div className="classroom-hub__shell">
          <div className="classroom-hub__hero-card">
            <Link to="/admin/storefront?tab=digital" className="material-register__text-link" style={{ fontSize: "0.9rem" }}>
              ← 스토어 관리
            </Link>
            <div className="admin-layout__title-row">
              <h1>{isEdit ? "디지털마켓 상품 수정" : "디지털마켓 상품 등록"}</h1>
              <span className="ui-ko material-register__subtitle-bi">
                <span className="reg-form__label-en" style={{ display: "block", fontWeight: 700 }}>
                  {isEdit ? "Edit digital market listing" : "Digital market listing"}
                </span>
                <span className="reg-form__label-ko" style={{ display: "block", marginTop: "0.25rem" }}>
                  카드·이미지·본문이 연결될 <strong>구매·신청 URL</strong>을 지정합니다. 다운로드형과 이메일 배송형을 구분해
                  표시합니다.
                </span>
              </span>
            </div>
          </div>

          <div className="classroom-hub__callout classroom-hub__callout--info video-register-page__notice">
            <strong>이행 방식</strong>은 목록 카드 배지에 반영됩니다. 요약은 카드에 짧게 노출되고, 본문은 리치 텍스트로
            작성할 수 있습니다.
          </div>

          {!firebaseUser ? <p className="auth-error">로그인이 필요합니다.</p> : null}

          {loadBusy ? (
            <div className="route-loading route-loading--light" style={{ marginTop: "1.5rem" }}>
              <div className="route-loading__spinner" />
              <p className="ui-ko">불러오는 중…</p>
            </div>
          ) : null}
          {loadErr ? <p className="auth-error">{loadErr}</p> : null}

          {firebaseUser && !loadBusy && !loadErr ? (
            <div className="classroom-hub__panel classroom-hub__panel--manage video-register-page__panel">
              <form
                className="video-register-page__form material-register-form__grid"
                onSubmit={(e) => void onSubmit(e)}
              >
                {formMsg ? <p className="auth-error">{formMsg}</p> : null}

                <div className="classroom-hub__card">
                  <h3 className="classroom-hub__card-title">노출 정보</h3>
                  <label className="reg-form__field" htmlFor="dm-title">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Title</span>
                      <span className="reg-form__label-ko">제목</span>
                    </span>
                    <input
                      id="dm-title"
                      className="add-passage__control material-register-form__input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      autoComplete="off"
                    />
                  </label>
                  <label className="reg-form__field" htmlFor="dm-summary">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Card summary</span>
                      <span className="reg-form__label-ko">짧은 요약 (카드)</span>
                    </span>
                    <input
                      id="dm-summary"
                      className="add-passage__control material-register-form__input"
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      placeholder="한 줄 소개"
                      autoComplete="off"
                    />
                  </label>
                  <label className="reg-form__field" htmlFor="dm-price">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Price (KRW)</span>
                      <span className="reg-form__label-ko">판매 가격(원) · 필수</span>
                    </span>
                    <input
                      id="dm-price"
                      className="add-passage__control material-register-form__input"
                      type="text"
                      inputMode="numeric"
                      value={priceKrwInput}
                      onChange={(e) => setPriceKrwInput(e.target.value)}
                      placeholder="예: 39000"
                      autoComplete="off"
                      required
                    />
                  </label>
                </div>

                <div className="classroom-hub__card classroom-hub__card--soft">
                  <h3 className="classroom-hub__card-title">링크 · 이행 방식</h3>
                  <label className="reg-form__field" htmlFor="dm-fulfillment">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Fulfillment</span>
                      <span className="reg-form__label-ko">이행 방식</span>
                    </span>
                    <select
                      id="dm-fulfillment"
                      className="add-passage__control material-register-form__input"
                      value={fulfillmentType}
                      onChange={(e) =>
                        setFulfillmentType(e.target.value === "email" ? "email" : "download")
                      }
                    >
                      <option value="download">다운로드</option>
                      <option value="email">이메일 배송</option>
                    </select>
                  </label>
                  <label className="reg-form__field" htmlFor="dm-purchase">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Purchase / apply URL</span>
                      <span className="reg-form__label-ko">구매·신청 링크</span>
                    </span>
                    <input
                      id="dm-purchase"
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

                <div className="classroom-hub__card">
                  <h3 className="classroom-hub__card-title">대표 이미지</h3>
                  <div className="market-register-image-row">
                    <div className="market-register-image-row__fields">
                      <label className="reg-form__field" htmlFor="dm-img-file">
                        <span className="reg-form__label-line">
                          <span className="reg-form__label-en">Image file</span>
                          <span className="reg-form__label-ko">파일 업로드</span>
                        </span>
                        <input
                          id="dm-img-file"
                          type="file"
                          accept="image/*"
                          className="add-passage__control add-passage__control--file video-register-page__file"
                          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                        />
                      </label>
                      <label className="reg-form__field" htmlFor="dm-img-url">
                        <span className="reg-form__label-line">
                          <span className="reg-form__label-en">Or image URL</span>
                          <span className="reg-form__label-ko">또는 이미지 URL</span>
                        </span>
                        <input
                          id="dm-img-url"
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
                  <h3 className="classroom-hub__card-title">상세 본문</h3>
                  <div className="reg-form__field material-register-form__field-rich">
                    <span className="reg-form__label-line">
                      <span className="reg-form__label-en">Description</span>
                      <span className="reg-form__label-ko">리치 텍스트</span>
                    </span>
                    <p className="material-register-form__rich-hint">서식·링크·이미지 삽입 가능합니다.</p>
                    <RichTextEditor
                      value={descriptionHtml}
                      onChange={setDescriptionHtml}
                      userId={uid}
                      placeholder="상품 설명, 포함 파일 안내, 이메일 배송 시 유의사항 등"
                    />
                  </div>
                </div>

                <div className="classroom-hub__card classroom-hub__card--actions">
                  <button type="submit" className="btn btn--primary btn--stack video-register-page__submit" disabled={busy}>
                    <span className="ui-en">{busy ? "Saving…" : isEdit ? "Save changes" : "Publish"}</span>
                    <span className="ui-ko">{busy ? "저장 중…" : isEdit ? "수정 저장" : "등록"}</span>
                  </button>
                  <Link to="/admin/storefront?tab=digital" className="btn btn--ghost btn--stack" style={{ marginTop: "0.65rem" }}>
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
