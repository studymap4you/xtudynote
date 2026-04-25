import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AdminTopNav } from "@/components/AdminTopNav";
import { DashboardShell } from "@/components/DashboardShell";
import { generateKnowledgeMaterialMarkdown } from "@/lib/knowledgeCuration/generateKnowledgeMaterial";
import {
  appendCurationItems,
  buildFileHit,
  buildManualHit,
  createCuration,
  deleteCurationItems,
  deleteCurations,
  listCurationItems,
  listCurations,
  listKnowledgeMaterials,
  saveKnowledgeMaterial,
} from "@/lib/knowledgeCuration/knowledgeCurationApi";
import { uploadKnowledgeCurationFile } from "@/lib/knowledgeCuration/uploadKnowledgeCurationFile";
import { searchKnowledgeSources } from "@/lib/knowledgeCuration/searchKnowledgeSources";
import type { KnowledgeCurationDoc, KnowledgeCurationItem, KnowledgeMaterialDoc } from "@/types/knowledgeCuration";
import type { KnowledgeSearchHit, KnowledgeSourceType } from "@/types/knowledgeCuration";
import styles from "@/pages/admin/knowledgeCurationPage.module.css";
import "@/pages/pages.css";

function sourceTypeLabel(t: KnowledgeSourceType): string {
  switch (t) {
    case "youtube":
      return "YouTube";
    case "paper":
      return "논문";
    case "news":
      return "뉴스";
    case "file":
      return "파일";
    default:
      return t;
  }
}

function Inner() {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? "";

  const [curations, setCurations] = useState<{ id: string; data: KnowledgeCurationDoc }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [items, setItems] = useState<KnowledgeCurationItem[]>([]);
  const [materials, setMaterials] = useState<{ id: string; data: KnowledgeMaterialDoc }[]>([]);

  const [newTitle, setNewTitle] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [types, setTypes] = useState<Set<KnowledgeSourceType>>(
    () => new Set<KnowledgeSourceType>(["youtube", "paper", "news"]),
  );
  const [staging, setStaging] = useState<KnowledgeSearchHit[]>([]);
  /** 체크된 tempId = 큐에 넣지 않을(삭제할) 검색 결과 */
  const [excludeStaging, setExcludeStaging] = useState<Set<string>>(() => new Set());
  const [savedSelected, setSavedSelected] = useState<Set<string>>(() => new Set());

  const [manualType, setManualType] = useState<KnowledgeSourceType>("youtube");
  const [manualTitle, setManualTitle] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [curationDeleteSelected, setCurationDeleteSelected] = useState<Set<string>>(() => new Set());
  const [uploadTitle, setUploadTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [matTitle, setMatTitle] = useState("");
  const [matExtra, setMatExtra] = useState("");
  const [genBusy, setGenBusy] = useState(false);

  const refreshCurations = useCallback(async () => {
    if (!uid) return;
    const list = await listCurations(uid);
    setCurations(list);
  }, [uid]);

  const refreshItems = useCallback(async () => {
    if (!selectedId) {
      setItems([]);
      return;
    }
    setItems(await listCurationItems(selectedId));
  }, [selectedId]);

  const refreshMaterials = useCallback(async () => {
    if (!uid) return;
    setMaterials(await listKnowledgeMaterials(uid));
  }, [uid]);

  useEffect(() => {
    void refreshCurations();
  }, [refreshCurations]);

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev && curations.some((c) => c.id === prev)) return prev;
      return curations[0]?.id ?? null;
    });
  }, [curations]);

  useEffect(() => {
    void refreshItems();
  }, [refreshItems]);

  useEffect(() => {
    void refreshMaterials();
  }, [refreshMaterials]);

  const selectedCuration = curations.find((c) => c.id === selectedId);

  const toggleType = (t: KnowledgeSourceType) => {
    setTypes((prev) => {
      const n = new Set(prev);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });
  };

  const runSearch = async () => {
    setErr(null);
    setMsg(null);
    setBusy(true);
    try {
      const hits = await searchKnowledgeSources({ query: q, types: [...types] });
      setStaging(hits);
      setExcludeStaging(new Set());
      if (hits.length === 0) {
        setMsg(
          "검색 결과가 없습니다. 유튜브·뉴스는 API 키가 있어야 하며, 논문은 Crossref에서 가져옵니다. 직접 입력으로 추가해 보세요.",
        );
      } else {
        setMsg(`${hits.length}건을 불러왔습니다. 제외할 항목에 체크한 뒤「체크 제외하고 큐에 저장」을 누르세요.`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addManualToStaging = () => {
    setErr(null);
    if (!manualTitle.trim() || !manualUrl.trim()) {
      setErr("직접 입력은 제목과 URL이 필요합니다.");
      return;
    }
    const hit = buildManualHit(manualType, manualTitle, manualUrl);
    setStaging((s) => [hit, ...s]);
    setManualTitle("");
    setManualUrl("");
    setMsg("스테이징 목록에 추가했습니다.");
  };

  const saveStagingToCuration = async () => {
    if (!selectedId) {
      setErr("먼저 왼쪽에서 큐레이션을 선택하세요.");
      return;
    }
    const toSave = staging.filter((h) => !excludeStaging.has(h.tempId));
    if (toSave.length === 0) {
      setErr("저장할 항목이 없습니다. 체크 해제를 확인하거나 검색·입력을 추가하세요.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await appendCurationItems(selectedId, toSave);
      setStaging([]);
      setExcludeStaging(new Set());
      setMsg(`${toSave.length}건을 큐레이션에 저장했습니다.`);
      await refreshItems();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeCheckedStaging = () => {
    setStaging((s) => s.filter((h) => !excludeStaging.has(h.tempId)));
    setExcludeStaging(new Set());
    setMsg("체크한 항목을 스테이징 목록에서 제거했습니다.");
  };

  const deleteSavedChecked = async () => {
    if (!selectedId || savedSelected.size === 0) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteCurationItems(selectedId, [...savedSelected]);
      setSavedSelected(new Set());
      setMsg("선택한 저장 항목을 삭제했습니다.");
      await refreshItems();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteSelectedCurations = async () => {
    if (curationDeleteSelected.size === 0) return;
    const ids = [...curationDeleteSelected];
    const ok = window.confirm(
      `선택한 큐레이션 ${ids.length}개와 그 안의 모든 자료·업로드 파일을 삭제합니다. 계속할까요?`,
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteCurations(uid, ids);
      setCurationDeleteSelected(new Set());
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null);
      }
      setMsg("선택한 큐레이션을 삭제했습니다.");
      await refreshCurations();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadLocalToStaging = async () => {
    if (!selectedId) {
      setErr("왼쪽에서 큐레이션을 먼저 선택한 뒤 파일을 올려 주세요.");
      return;
    }
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      setErr("파일을 선택하세요.");
      return;
    }
    if (file.size > 45 * 1024 * 1024) {
      setErr("파일은 45MB 이하만 업로드할 수 있습니다.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { downloadUrl, storagePath } = await uploadKnowledgeCurationFile(uid, selectedId, file);
      const title = uploadTitle.trim() || file.name;
      const hit = buildFileHit({
        title,
        downloadUrl,
        storagePath,
        originalName: file.name,
      });
      setStaging((s) => [hit, ...s]);
      setUploadTitle("");
      if (input) input.value = "";
      setMsg("업로드한 파일을 스테이징에 추가했습니다.「체크 제외하고 큐에 저장」으로 확정하세요.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const createNewCuration = async () => {
    if (!uid) return;
    const t = newTitle.trim();
    const topic = newTopic.trim();
    if (!t || !topic) {
      setErr("새 큐레이션 제목과 학습 분야를 입력하세요.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const id = await createCuration(uid, t, topic);
      setNewTitle("");
      setNewTopic("");
      setSelectedId(id);
      setMsg("새 큐레이션을 만들었습니다.");
      await refreshCurations();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runGenerateMaterial = async () => {
    if (!selectedId || !selectedCuration) {
      setErr("큐레이션을 선택하세요.");
      return;
    }
    if (items.length === 0) {
      setErr("저장된 항목이 있어야 학습자료를 구성할 수 있습니다.");
      return;
    }
    setGenBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const title = matTitle.trim() || `${selectedCuration.data.title} 학습자료`;
      const md = await generateKnowledgeMaterialMarkdown({
        curationTitle: selectedCuration.data.title,
        topicDomain: selectedCuration.data.topicDomain,
        items,
        extraInstructions: matExtra,
      });
      const mid = await saveKnowledgeMaterial({
        ownerId: uid,
        curationId: selectedId,
        title,
        bodyMarkdown: md,
        sourceItemIds: items.map((i) => i.id),
      });
      setMatTitle("");
      setMatExtra("");
      setMsg(`학습자료 초안을 저장했습니다. (문서 ID: ${mid.slice(0, 8)}…)`);
      await refreshMaterials();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGenBusy(false);
    }
  };

  return (
    <DashboardShell light adminChrome>
      <AdminTopNav />
      <main className={`admin-layout classroom-page admin-layout--light ${styles.page}`}>
        <nav className="classroom-page__breadcrumb">
          <Link to="/dashboard">← 대시보드</Link>
        </nav>
        <div className="admin-layout__title-row">
          <h1>지식 큐레이션</h1>
          <span className="ui-ko">마스터 전용 · 검색·선별·저장 후 학습자료 초안 생성 → 강의실 개설 시 연결</span>
        </div>
        <p className={styles.lead}>
          학습 분야 키워드로 유튜브·논문(Crossref)·뉴스(GNews, 키 필요)를 검색하고,{" "}
          <strong>제외할 항목에 체크</strong>한 뒤 나머지만 큐에 저장합니다. 저장된 링크를 바탕으로 OpenAI로 마크다운 학습자료
          초안을 만든 뒤, <Link to="/classroom/new">강의실 개설</Link> 화면에서 자료를 붙여 넣을 수 있습니다.
        </p>

        <section style={{ marginBottom: "1.25rem" }}>
          <h2 className="classroom-hub__section-title">새 큐레이션 만들기</h2>
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor="kc-title">큐레이션 이름</label>
              <input id="kc-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="예: 2026 봄 · 미분방정식 입문" />
            </div>
            <div className={styles.field}>
              <label htmlFor="kc-topic">학습 분야 / 키워드</label>
              <input id="kc-topic" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="예: differential equations pedagogy" />
            </div>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void createNewCuration()}>
              생성
            </button>
          </div>
        </section>

        {err ? <p className={styles.err}>{err}</p> : null}
        {msg ? <p className={styles.ok}>{msg}</p> : null}

        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <div className={styles.sideTitle}>내 큐레이션</div>
            {curations.length === 0 ? (
              <p className="ui-ko" style={{ fontSize: "0.82rem", color: "#64748b", padding: "0.35rem" }}>
                목록이 비었습니다. 위에서 새로 만드세요.
              </p>
            ) : (
              curations.map((c) => (
                <div key={c.id} className={styles.sideRow}>
                  <label className={styles.sideCheck}>
                    <input
                      type="checkbox"
                      checked={curationDeleteSelected.has(c.id)}
                      onChange={() =>
                        setCurationDeleteSelected((prev) => {
                          const n = new Set(prev);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        })
                      }
                      aria-label={`「${c.data.title}」삭제 대상으로 선택`}
                    />
                  </label>
                  <button
                    type="button"
                    className={`${styles.sideRowBtn} ${selectedId === c.id ? styles.sideBtnActive : ""}`}
                    onClick={() => {
                      setSelectedId(c.id);
                      setErr(null);
                      setMsg(null);
                    }}
                  >
                    {c.data.title}
                  </button>
                </div>
              ))
            )}
            {curations.length > 0 ? (
              <div className={styles.sideToolbar}>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ width: "100%", fontSize: "0.78rem" }}
                  disabled={busy || curationDeleteSelected.size === 0}
                  onClick={() => void deleteSelectedCurations()}
                >
                  선택한 큐레이션 삭제 ({curationDeleteSelected.size})
                </button>
              </div>
            ) : null}
          </aside>

          <div className={styles.main}>
            {!selectedCuration ? (
              <p className="ui-ko">큐레이션을 선택하거나 새로 만드세요.</p>
            ) : (
              <>
                <h2 className={styles.panelTitle}>{selectedCuration.data.title}</h2>
                <p className={styles.panelMeta}>
                  분야: <strong>{selectedCuration.data.topicDomain}</strong>
                </p>

                <div className={styles.sectionLabel}>검색</div>
                <div className={styles.typeToggles}>
                  {(["youtube", "paper", "news"] as const).map((t) => (
                    <label key={t} className={styles.typeToggle}>
                      <input type="checkbox" checked={types.has(t)} onChange={() => toggleType(t)} />
                      {t === "youtube" ? "YouTube" : t === "paper" ? "논문 (Crossref)" : "뉴스 (GNews)"}
                    </label>
                  ))}
                </div>
                <div className={styles.row}>
                  <div className={styles.field} style={{ flex: 2 }}>
                    <label htmlFor="kc-q">검색어</label>
                    <input id="kc-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="영어·한글 키워드" />
                  </div>
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void runSearch()}>
                    검색
                  </button>
                </div>
                <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 0.5rem" }}>
                  VITE_YOUTUBE_API_KEY · VITE_GNEWS_API_KEY 가 .env.local 에 있으면 해당 소스가 활성화됩니다.
                </p>

                <div className={styles.sectionLabel}>직접 추가 (URL)</div>
                <div className={styles.row}>
                  <div className={styles.field} style={{ flex: 0, minWidth: "110px" }}>
                    <label>유형</label>
                    <select value={manualType} onChange={(e) => setManualType(e.target.value as KnowledgeSourceType)}>
                      <option value="youtube">YouTube</option>
                      <option value="paper">논문</option>
                      <option value="news">뉴스</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>제목</label>
                    <input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
                  </div>
                  <div className={styles.field} style={{ flex: 2 }}>
                    <label>URL</label>
                    <input value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} />
                  </div>
                  <button type="button" className="btn btn--ghost" onClick={addManualToStaging}>
                    스테이징에 추가
                  </button>
                </div>

                <div className={styles.sectionLabel}>내 PC에서 파일 업로드</div>
                <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0 0 0.5rem" }}>
                  현재 선택한 큐레이션에 연결되어 Storage에 저장됩니다. (최대 45MB · 마스터만 업로드 가능)
                </p>
                <div className={styles.row}>
                  <div className={styles.field} style={{ flex: 1 }}>
                    <label htmlFor="kc-upload-title">표시 제목 (선택)</label>
                    <input
                      id="kc-upload-title"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="비우면 파일 이름이 제목으로 들어갑니다"
                    />
                  </div>
                  <div className={styles.field} style={{ flex: 1 }}>
                    <label htmlFor="kc-file">파일</label>
                    <input id="kc-file" ref={fileInputRef} type="file" className="add-passage__control" />
                  </div>
                  <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void uploadLocalToStaging()}>
                    업로드 후 스테이징에 추가
                  </button>
                </div>

                {staging.length > 0 ? (
                  <>
                    <div className={styles.sectionLabel}>스테이징 (체크 = 큐에 넣지 않음 / 제외)</div>
                    <table className={styles.hitTable}>
                      <thead>
                        <tr>
                          <th style={{ width: "2.5rem" }}>제외</th>
                          <th>유형</th>
                          <th>제목</th>
                          <th>링크</th>
                        </tr>
                      </thead>
                      <tbody>
                        {staging.map((h) => (
                          <tr key={h.tempId}>
                            <td>
                              <input
                                type="checkbox"
                                checked={excludeStaging.has(h.tempId)}
                                onChange={() =>
                                  setExcludeStaging((prev) => {
                                    const n = new Set(prev);
                                    if (n.has(h.tempId)) n.delete(h.tempId);
                                    else n.add(h.tempId);
                                    return n;
                                  })
                                }
                                aria-label="큐 저장에서 제외"
                              />
                            </td>
                            <td>{sourceTypeLabel(h.type)}</td>
                            <td>{h.title}</td>
                            <td>
                              <a href={h.url} target="_blank" rel="noreferrer">
                                {h.url.slice(0, 48)}
                                {h.url.length > 48 ? "…" : ""}
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className={styles.row}>
                      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void saveStagingToCuration()}>
                        체크 제외하고 큐에 저장
                      </button>
                      <button type="button" className="btn btn--ghost" disabled={busy} onClick={removeCheckedStaging}>
                        체크 항목을 스테이징에서만 삭제
                      </button>
                    </div>
                  </>
                ) : null}

                <div className={styles.divider} />

                <div className={styles.sectionLabel}>저장된 항목 (체크 후 영구 삭제)</div>
                {items.length === 0 ? (
                  <p className="ui-ko" style={{ color: "#64748b", fontSize: "0.85rem" }}>
                    아직 저장된 링크가 없습니다.
                  </p>
                ) : (
                  <>
                    <table className={styles.hitTable}>
                      <thead>
                        <tr>
                          <th style={{ width: "2.5rem" }}>삭제</th>
                          <th>유형</th>
                          <th>제목</th>
                          <th>링크</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it) => (
                          <tr key={it.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={savedSelected.has(it.id)}
                                onChange={() =>
                                  setSavedSelected((prev) => {
                                    const n = new Set(prev);
                                    if (n.has(it.id)) n.delete(it.id);
                                    else n.add(it.id);
                                    return n;
                                  })
                                }
                                aria-label="영구 삭제 대상"
                              />
                            </td>
                            <td>{sourceTypeLabel(it.type)}</td>
                            <td>{it.title}</td>
                            <td>
                              <a href={it.url} target="_blank" rel="noreferrer">
                                열기
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button type="button" className="btn btn--ghost" disabled={busy || savedSelected.size === 0} onClick={() => void deleteSavedChecked()}>
                      선택 항목 영구 삭제 ({savedSelected.size})
                    </button>
                  </>
                )}

                <div className={styles.divider} />

                <div className={styles.sectionLabel}>학습자료 초안 (OpenAI)</div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>자료 제목</label>
                    <input value={matTitle} onChange={(e) => setMatTitle(e.target.value)} placeholder="비우면 큐레이션 이름 기준" />
                  </div>
                </div>
                <div className={styles.field} style={{ marginBottom: "0.65rem" }}>
                  <label>추가 지시 (선택)</label>
                  <textarea rows={3} value={matExtra} onChange={(e) => setMatExtra(e.target.value)} style={{ width: "100%", borderRadius: 8, border: "1px solid #cbd5e1", padding: "0.45rem" }} />
                </div>
                <button type="button" className="btn btn--primary" disabled={genBusy || items.length === 0} onClick={() => void runGenerateMaterial()}>
                  {genBusy ? "생성 중…" : "저장 링크로 학습자료 초안 생성"}
                </button>

                <div className={styles.divider} />

                <div className={styles.sectionLabel}>저장된 학습자료</div>
                {materials.length === 0 ? (
                  <p style={{ color: "#64748b", fontSize: "0.85rem" }}>아직 없습니다.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.85rem" }}>
                    {materials.map((m) => (
                      <li key={m.id} style={{ marginBottom: "0.35rem" }}>
                        <strong>{m.data.title}</strong>{" "}
                        <span style={{ color: "#64748b" }}>
                          ({new Date(
                            (m.data.createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0,
                          ).toLocaleString("ko-KR")}
                          )
                        </span>{" "}
                        <code style={{ fontSize: "0.72rem", background: "#f1f5f9", padding: "0.1rem 0.25rem" }}>{m.id}</code>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}

export function KnowledgeCurationPage() {
  return <Inner />;
}
