import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DashboardShell } from "@/components/DashboardShell";
import { deleteDigitalMarketProduct, subscribeDigitalMarketProducts } from "@/lib/market/digitalMarketApi";
import { deleteXtudyMarketProduct, subscribeXtudyMarketProducts } from "@/lib/market/xtudyMarketApi";
import { deleteVideoCatalogEntry, subscribeVideoCatalog } from "@/lib/videoCatalog/videoCatalogApi";
import type { DigitalMarketProductDoc } from "@/types/digitalMarketProduct";
import type { XtudyMarketProductDoc } from "@/types/xtudyMarketProduct";
import type { VideoCatalogDoc } from "@/types/videoCatalog";
import "@/pages/pages.css";

type TabId = "digital" | "xtudy" | "videos";

function tabFromSearch(raw: string | null): TabId {
  if (raw === "xtudy") return "xtudy";
  if (raw === "videos") return "videos";
  return "digital";
}

function formatCreated(at: unknown): string {
  if (at && typeof at === "object" && at !== null && "toDate" in at) {
    const d = (at as { toDate: () => Date }).toDate();
    if (d instanceof Date && !Number.isNaN(d.getTime())) {
      return d.toLocaleDateString("ko-KR", { dateStyle: "medium" });
    }
  }
  return "—";
}

export function StorefrontManagePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => tabFromSearch(searchParams.get("tab")), [searchParams]);

  const setTab = useCallback(
    (next: TabId) => {
      if (next === "digital") setSearchParams({}, { replace: true });
      else setSearchParams({ tab: next }, { replace: true });
    },
    [setSearchParams],
  );

  const [digitalRows, setDigitalRows] = useState<{ id: string; data: DigitalMarketProductDoc }[]>([]);
  const [xtudyRows, setXtudyRows] = useState<{ id: string; data: XtudyMarketProductDoc }[]>([]);
  const [videoRows, setVideoRows] = useState<{ id: string; data: VideoCatalogDoc }[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const u1 = subscribeDigitalMarketProducts(
      (list) => setDigitalRows(list),
      (e) => setLoadErr(e.message),
    );
    const u2 = subscribeXtudyMarketProducts(
      (list) => setXtudyRows(list),
      (e) => setLoadErr(e.message),
    );
    const u3 = subscribeVideoCatalog(
      (list) => setVideoRows(list),
      (e) => setLoadErr(e.message),
    );
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const onDeleteDigital = async (id: string, title: string) => {
    if (!window.confirm(`디지털마켓에서 이 상품을 삭제할까요?\n${title}`)) return;
    setDeletingId(id);
    try {
      await deleteDigitalMarketProduct(id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const onDeleteXtudy = async (id: string, title: string) => {
    if (!window.confirm(`엑스터디마켓에서 이 상품을 삭제할까요?\n${title}`)) return;
    setDeletingId(id);
    try {
      await deleteXtudyMarketProduct(id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  const onDeleteVideo = async (id: string, title: string) => {
    if (!window.confirm(`홈 동영상 목록에서 이 항목을 삭제할까요?\n${title}`)) return;
    setDeletingId(id);
    try {
      await deleteVideoCatalogEntry(id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <DashboardShell light>
      <main className="dashboard dashboard--super-admin storefront-admin">
        <header className="storefront-admin__hero">
          <p className="super-admin-hero__eyebrow ui-en">Storefront</p>
          <h1 className="dashboard__title">스토어 · 홈 동영상 관리</h1>
          <p className="dashboard__subtitle">
            <span className="ui-ko">
              디지털마켓·엑스터디마켓·동영상 강의(홈) 노출 항목을 등록·삭제합니다. 공개 페이지에는 목록만 표시됩니다.
            </span>
          </p>
        </header>

        <div className="storefront-admin__tabs" role="tablist" aria-label="관리 구역">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "digital"}
            className={`storefront-admin__tab${tab === "digital" ? " is-active" : ""}`}
            onClick={() => setTab("digital")}
          >
            디지털마켓
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "xtudy"}
            className={`storefront-admin__tab${tab === "xtudy" ? " is-active" : ""}`}
            onClick={() => setTab("xtudy")}
          >
            엑스터디마켓
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "videos"}
            className={`storefront-admin__tab${tab === "videos" ? " is-active" : ""}`}
            onClick={() => setTab("videos")}
          >
            동영상 강의(홈)
          </button>
        </div>

        {loadErr ? <p className="auth-error storefront-admin__err">{loadErr}</p> : null}

        {tab === "digital" ? (
          <section className="panel storefront-admin__panel">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">디지털마켓 상품</h2>
                <span className="ui-ko panel__tagline">공개: /digital-market</span>
              </div>
              <Link to="/admin/storefront/digital-market/new" className="btn btn--primary btn--stack">
                <span className="ui-en">New product</span>
                <span className="ui-ko">상품 등록</span>
              </Link>
            </div>
            {digitalRows.length === 0 ? (
              <p className="storefront-admin__empty">등록된 상품이 없습니다.</p>
            ) : (
              <ul className="storefront-admin__list">
                {digitalRows.map(({ id, data }) => (
                  <li key={id} className="storefront-admin__row">
                    <div className="storefront-admin__row-main">
                      <strong className="storefront-admin__title">{data.title}</strong>
                      <span className="storefront-admin__meta">{formatCreated(data.createdAt)}</span>
                      <a
                        href={data.purchaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="storefront-admin__link"
                      >
                        구매·신청 링크
                      </a>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost storefront-admin__danger"
                      disabled={deletingId === id}
                      onClick={() => void onDeleteDigital(id, data.title)}
                    >
                      {deletingId === id ? "삭제 중…" : "삭제"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === "xtudy" ? (
          <section className="panel storefront-admin__panel">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">엑스터디마켓 상품</h2>
                <span className="ui-ko panel__tagline">공개: /xtudy-market</span>
              </div>
              <Link to="/admin/storefront/xtudy-market/new" className="btn btn--primary btn--stack">
                <span className="ui-en">New product</span>
                <span className="ui-ko">상품 등록</span>
              </Link>
            </div>
            {xtudyRows.length === 0 ? (
              <p className="storefront-admin__empty">등록된 상품이 없습니다.</p>
            ) : (
              <ul className="storefront-admin__list">
                {xtudyRows.map(({ id, data }) => (
                  <li key={id} className="storefront-admin__row">
                    <div className="storefront-admin__row-main">
                      <strong className="storefront-admin__title">{data.title}</strong>
                      <span className="storefront-admin__meta">{formatCreated(data.createdAt)}</span>
                      <Link to={`/xtudy-market/p/${id}`} className="storefront-admin__link" target="_blank">
                        상세 페이지 미리보기
                      </Link>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost storefront-admin__danger"
                      disabled={deletingId === id}
                      onClick={() => void onDeleteXtudy(id, data.title)}
                    >
                      {deletingId === id ? "삭제 중…" : "삭제"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {tab === "videos" ? (
          <section className="panel storefront-admin__panel">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">동영상 강의 (홈 화면)</h2>
                <span className="ui-ko panel__tagline">공개: /videos</span>
              </div>
              <Link to="/admin/storefront/videos/new" className="btn btn--primary btn--stack">
                <span className="ui-en">New video</span>
                <span className="ui-ko">동영상 등록</span>
              </Link>
            </div>
            {videoRows.length === 0 ? (
              <p className="storefront-admin__empty">등록된 동영상이 없습니다.</p>
            ) : (
              <ul className="storefront-admin__list">
                {videoRows.map(({ id, data }) => (
                  <li key={id} className="storefront-admin__row">
                    <div className="storefront-admin__row-main">
                      <strong className="storefront-admin__title">{data.title}</strong>
                      <span className="storefront-admin__meta">{formatCreated(data.createdAt)}</span>
                      <a
                        href={data.watchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="storefront-admin__link"
                      >
                        시청 링크
                      </a>
                    </div>
                    <button
                      type="button"
                      className="btn btn--ghost storefront-admin__danger"
                      disabled={deletingId === id}
                      onClick={() => void onDeleteVideo(id, data.title)}
                    >
                      {deletingId === id ? "삭제 중…" : "삭제"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        <p className="storefront-admin__footer">
          <Link to="/dashboard" className="btn btn--ghost btn--stack">
            ← 마스터 대시보드
          </Link>
        </p>
      </main>
    </DashboardShell>
  );
}
