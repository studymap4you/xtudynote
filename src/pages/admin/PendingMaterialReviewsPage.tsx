import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Link } from "react-router-dom";
import {
  collection,
  onSnapshot,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/firebase/config";
import {
  approveFileMaterialRequest,
  approveVideoMaterialRequest,
  rejectFileMaterialRequest,
  rejectVideoMaterialRequest,
} from "@/lib/adminMaterialRequestPublish";
import { AdminTopNav } from "@/components/AdminTopNav";
import type { MaterialRequestDocument } from "@/types/materialRequest";
import type { VideoMaterialRequestDocument } from "@/types/videoMaterialRequest";
import { collectVideoUrlsFromRequest } from "@/lib/videoMaterialUrls";
import type { ContentType } from "@/types/content";
import "@/pages/pages.css";

type QueueRowBase = {
  id: string;
  title: string;
  subject: string;
  materialType: ContentType;
  submitterId: string;
  audienceGrade: string;
  description: string;
  videoUrls: string[];
  fileCount: number;
  classroomId: string | null;
  createdAtMs: number;
  createdAtLabel: string;
};

type QueueRow =
  | (QueueRowBase & { kind: "file"; raw: MaterialRequestDocument })
  | (QueueRowBase & { kind: "video"; raw: VideoMaterialRequestDocument });

function formatCreatedAt(raw: unknown): string {
  if (raw instanceof Timestamp) {
    return raw.toDate().toLocaleString();
  }
  if (
    raw !== null &&
    typeof raw === "object" &&
    "toDate" in raw &&
    typeof (raw as { toDate?: () => Date }).toDate === "function"
  ) {
    try {
      return (raw as { toDate: () => Date }).toDate().toLocaleString();
    } catch {
      return "—";
    }
  }
  return "—";
}

function createdAtToMs(raw: unknown): number {
  if (raw instanceof Timestamp) return raw.toMillis();
  if (
    raw !== null &&
    typeof raw === "object" &&
    "toMillis" in raw &&
    typeof (raw as { toMillis?: () => number }).toMillis === "function"
  ) {
    try {
      return (raw as { toMillis: () => number }).toMillis();
    } catch {
      return 0;
    }
  }
  return 0;
}

function labelType(t: ContentType): string {
  if (t === "share") return "공유";
  if (t === "paid") return "유료";
  return "과제";
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      reject(
        new Error(
          `${label} 처리 시간이 초과되었습니다 (${Math.round(ms / 1000)}초). 네트워크·방화벽을 확인하고 다시 시도해 주세요.`
        )
      );
    }, ms);
    promise.then(
      (v) => {
        window.clearTimeout(t);
        resolve(v);
      },
      (e) => {
        window.clearTimeout(t);
        reject(e);
      }
    );
  });
}

type BannerState =
  | { kind: "info"; text: string }
  | { kind: "success"; text: string }
  | { kind: "error"; text: string };

function formatApproveError(e: unknown): string {
  if (e && typeof e === "object" && "code" in e && "message" in e) {
    const code = String((e as { code?: string }).code ?? "");
    const msg = String((e as { message?: string }).message ?? e);
    if (code) return `[${code}] ${msg}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

export function PendingMaterialReviewsPage() {
  const { isSuperAdmin } = useAuth();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);

  useEffect(() => {
    if (!isSuperAdmin) return;

    setLoading(true);
    setError(null);

    const qFile = query(collection(db, "material_requests"), where("status", "==", "pending"));
    const qVideo = query(collection(db, "video_material_requests"), where("status", "==", "pending"));

    let fileRows: QueueRow[] = [];
    let videoRows: QueueRow[] = [];

    const merge = () => {
      const merged = [...fileRows, ...videoRows].sort((a, b) => b.createdAtMs - a.createdAtMs);
      setRows(merged);
      setLoading(false);
    };

    const unsubFile = onSnapshot(
      qFile,
      (snap) => {
        fileRows = [];
        snap.forEach((d) => {
          const x = d.data() as MaterialRequestDocument;
          const lm = x.learningMaterialFilePaths?.length ?? 0;
          const rf = x.referenceMaterialFilePaths?.length ?? 0;
          fileRows.push({
            kind: "file",
            id: d.id,
            title: String(x.title ?? ""),
            subject: String(x.subject ?? ""),
            materialType: (x.materialType as ContentType) ?? "share",
            submitterId: String(x.submitterId ?? ""),
            audienceGrade: String(x.audienceGrade ?? ""),
            description: String(x.description ?? ""),
            videoUrls: [],
            fileCount: lm + rf,
            classroomId:
              x.classroomId != null && typeof x.classroomId === "string" ? x.classroomId : null,
            createdAtMs: createdAtToMs(x.createdAt),
            createdAtLabel: formatCreatedAt(x.createdAt),
            raw: x,
          });
        });
        merge();
      },
      (err) => {
        setError(err.message || "파일 자료 대기 목록을 불러오지 못했습니다.");
        setLoading(false);
      }
    );

    const unsubVideo = onSnapshot(
      qVideo,
      (snap) => {
        videoRows = [];
        snap.forEach((d) => {
          const x = d.data() as VideoMaterialRequestDocument;
          videoRows.push({
            kind: "video",
            id: d.id,
            title: String(x.title ?? ""),
            subject: String(x.subject ?? ""),
            materialType: (x.materialType as ContentType) ?? "share",
            submitterId: String(x.submitterId ?? ""),
            audienceGrade: String(x.audienceGrade ?? ""),
            description: String(x.description ?? ""),
            videoUrls: collectVideoUrlsFromRequest(x),
            fileCount: 0,
            classroomId:
              x.classroomId != null && typeof x.classroomId === "string" ? x.classroomId : null,
            createdAtMs: createdAtToMs(x.createdAt),
            createdAtLabel: formatCreatedAt(x.createdAt),
            raw: x,
          });
        });
        merge();
      },
      (err) => {
        setError(err.message || "동영상 자료 대기 목록을 불러오지 못했습니다.");
        setLoading(false);
      }
    );

    return () => {
      unsubFile();
      unsubVideo();
    };
  }, [isSuperAdmin]);

  const pendingCount = useMemo(() => rows.length, [rows]);

  const handleApprove = useCallback(async (row: QueueRow) => {
    const key = `${row.kind}:${row.id}`;
    flushSync(() => {
      setBusyKey(key);
      setError(null);
      setBanner({
        kind: "info",
        text:
          row.kind === "file"
            ? "승인 처리 중입니다. 파일을 Storage에서 복사하는 동안 1~2분 걸릴 수 있습니다. 이 창을 닫지 마세요."
            : "승인 처리 중입니다…",
      });
    });
    try {
      const approveMs = row.kind === "file" ? 240_000 : 120_000;
      if (row.kind === "file") {
        await withTimeout(approveFileMaterialRequest(db, row.id), approveMs, "파일 자료 승인");
      } else {
        await withTimeout(approveVideoMaterialRequest(db, row.id), approveMs, "동영상 자료 승인");
      }
      const okText =
        "승인되었습니다. 아래 목록에서 사라지며, 「콘텐츠 DB 관리」·라이브러리에서 확인할 수 있습니다.";
      setBanner({ kind: "success", text: okText });
      setError(null);
      try {
        window.alert(okText);
      } catch {
        /* alert 차단 시 무시 — 배너로 안내 */
      }
    } catch (e: unknown) {
      const msg = formatApproveError(e) || "승인 처리에 실패했습니다.";
      setError(msg);
      setBanner({ kind: "error", text: msg });
      try {
        window.alert(`승인 실패\n\n${msg}`);
      } catch {
        /* alert 차단 */
      }
    } finally {
      setBusyKey(null);
    }
  }, []);

  const handleReject = useCallback(async (row: QueueRow) => {
    if (!window.confirm("이 신청을 반려할까요? (제출자에게 별도 알림은 없습니다.)")) return;
    const key = `${row.kind}:${row.id}`;
    flushSync(() => {
      setBusyKey(key);
      setError(null);
      setBanner({ kind: "info", text: "반려 처리 중…" });
    });
    try {
      if (row.kind === "file") {
        await rejectFileMaterialRequest(db, row.id);
      } else {
        await rejectVideoMaterialRequest(db, row.id);
      }
      setBanner({ kind: "success", text: "반려 처리되었습니다." });
    } catch (e: unknown) {
      const msg = formatApproveError(e) || "반려 처리에 실패했습니다.";
      setError(msg);
      setBanner({ kind: "error", text: msg });
      try {
        window.alert(msg);
      } catch {
        /* alert 차단 */
      }
    } finally {
      setBusyKey(null);
    }
  }, []);

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="app-shell">
      <AdminTopNav />
      <main className="admin-layout contents-list">
        <div className="admin-layout__title-row">
          <h1>자료 등록 검수 대기</h1>
          <span className="ui-ko">
            통합·동영상 신청 → 승인 시 라이브러리(contents)에 반영 · 대기 {pendingCount}건
          </span>
        </div>
        <p style={{ color: "var(--text-muted)", marginBottom: "1rem", maxWidth: "52rem" }}>
          <span className="ui-en" style={{ display: "block" }}>
            Submissions from &quot;자료 등록&quot; and &quot;동영상 학습자료&quot; land here. Approve
            copies files into the author&apos;s storage folder and creates an approved library entry.
          </span>
          <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
            강의실에서 연 자료 등록도 동일하게 이 목록에 올라옵니다. 승인하면 제출자 ID로 콘텐츠가
            생성되고, 「콘텐츠 DB 관리」에서도 확인할 수 있습니다.
          </span>
        </p>
        {banner && (
          <div
            role="status"
            aria-live="polite"
            className={`pending-review-banner pending-review-banner--${banner.kind}`}
          >
            <span className="pending-review-banner__text">{banner.text}</span>
            <button
              type="button"
              className="btn btn--ghost pending-review-banner__dismiss"
              onClick={() => setBanner(null)}
            >
              닫기
            </button>
          </div>
        )}
        {error && <p className="auth-error">{error}</p>}
        {loading ? (
          <div className="route-loading">
            <div className="route-loading__spinner" />
            <p>
              <span className="ui-en">Loading queue…</span>
              <span className="ui-ko" style={{ display: "block", marginTop: "0.25rem" }}>
                검수 대기 목록 연결 중…
              </span>
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table admin-table--contents">
              <thead>
                <tr>
                  <th>유형</th>
                  <th>제목 / 링크</th>
                  <th>과목·학년</th>
                  <th>제출자 UID</th>
                  <th>강의실</th>
                  <th>접수일</th>
                  <th>액션</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ color: "var(--text-muted)" }}>
                      검수 대기 중인 신청이 없습니다.
                      <span className="ui-ko" style={{ display: "block", marginTop: "0.35rem" }}>
                        자료 등록·동영상 등록으로 접수하면 여기에 표시됩니다.
                      </span>
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const key = `${r.kind}:${r.id}`;
                    const busy = busyKey === key;
                    return (
                      <tr key={key}>
                        <td>
                          {r.kind === "file" ? (
                            <span title="파일 업로드 신청">파일 ({labelType(r.materialType)})</span>
                          ) : (
                            <span title="동영상 URL 신청">동영상 ({labelType(r.materialType)})</span>
                          )}
                          {r.kind === "file" && (
                            <span
                              style={{
                                display: "block",
                                fontSize: "0.78rem",
                                color: "var(--text-muted)",
                              }}
                            >
                              첨부 {r.fileCount}개
                            </span>
                          )}
                        </td>
                        <td>
                          <strong>{r.title}</strong>
                          {r.kind === "video" &&
                            r.videoUrls.map((u, vi) => (
                              <a
                                key={`${r.id}-vu-${vi}`}
                                href={u}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: "block",
                                  fontSize: "0.82rem",
                                  marginTop: "0.25rem",
                                  wordBreak: "break-all",
                                }}
                              >
                                {u}
                              </a>
                            ))}
                          <details style={{ marginTop: "0.4rem", fontSize: "0.85rem" }}>
                            <summary style={{ cursor: "pointer" }}>상세 설명</summary>
                            <div
                              style={{
                                marginTop: "0.35rem",
                                whiteSpace: "pre-wrap",
                                color: "var(--text-muted)",
                              }}
                            >
                              {r.description || "—"}
                            </div>
                          </details>
                        </td>
                        <td>
                          {r.subject}
                          <span style={{ display: "block", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                            {r.audienceGrade}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.78rem", wordBreak: "break-all" }}>{r.submitterId}</td>
                        <td>{r.classroomId ? <code>{r.classroomId}</code> : "—"}</td>
                        <td>{r.createdAtLabel}</td>
                        <td>
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                            <button
                              type="button"
                              className="btn btn--success btn--stack pending-review__action-btn"
                              disabled={busy}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleApprove(r);
                              }}
                            >
                              승인 · 라이브러리 반영
                            </button>
                            <button
                              type="button"
                              className="btn btn--danger btn--stack pending-review__action-btn"
                              disabled={busy}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleReject(r);
                              }}
                            >
                              반려
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ marginTop: "1.5rem" }}>
          <Link to="/admin/contents" className="btn btn--ghost btn--stack">
            콘텐츠 DB 관리로 이동
          </Link>
        </p>
      </main>
    </div>
  );
}
