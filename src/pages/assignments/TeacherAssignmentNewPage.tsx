import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FirebaseError } from "firebase/app";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { listClassroomsByTeacher, type ClassroomRow } from "@/lib/classroom/listTeacherClassrooms";
import { db, storage } from "@/firebase/config";
import { createWorksheetAssignment } from "@/lib/worksheet/assignmentApi";
import { buildDefaultWorksheetItems, buildWorksheetItemsFromAnalysis } from "@/lib/worksheet/buildWorksheetItems";
import { extractWorksheetPassageFromUpload } from "@/lib/worksheet/extractWorksheetPassageFromUpload";
import { normalizeAnalysisReport } from "@/lib/signalLogic/normalizeAnalysisReport";
import { minimalAnalysisForAssignment } from "@/lib/worksheet/minimalAnalysis";
import { buildRosterCandidates, listWorksheetRoster } from "@/lib/worksheet/teacherRosterApi";
import { deployWorksheetOutreach, lookupStudentByEmail } from "@/lib/worksheet/worksheetOutreachCalls";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import type { WorksheetLocalAttachment } from "@/types/worksheetAssignment";
import { DistributionRecipientsPanel, type RecipientDraft } from "@/pages/assignments/DistributionRecipientsPanel";
import styles from "@/pages/assignments/assignmentPages.module.css";

type DeployTrack = "internal" | "external";
type ContentSource = "ai" | "local";

export function TeacherAssignmentNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signalReportId = params.get("signalReportId")?.trim() ?? "";
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? "";

  const [deployTrack, setDeployTrack] = useState<DeployTrack>("internal");
  const [title, setTitle] = useState("학습지 과제");
  const [passage, setPassage] = useState("");
  const [analysis, setAnalysis] = useState<SignalLogicAnalysisReportJson | null>(null);
  /** Signal Logic에서 불러온 원본 — 삭제하지 않고 AI 첨부 시 복원용 */
  const [signalBundle, setSignalBundle] = useState<{
    passage: string;
    analysis: SignalLogicAnalysisReportJson;
  } | null>(null);

  const [contentSource, setContentSource] = useState<ContentSource | null>(null);
  const [localAttachment, setLocalAttachment] = useState<WorksheetLocalAttachment | null>(null);
  const [attachmentStatus, setAttachmentStatus] = useState<string>("과제물을 준비하려면 아래 버튼 중 하나를 선택하세요.");

  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [recipientRows, setRecipientRows] = useState<RecipientDraft[]>([]);
  const [registerByUid, setRegisterByUid] = useState<Record<string, "yes" | "no">>({});

  const [distributedLocal, setDistributedLocal] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);

  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [rosterRows, setRosterRows] = useState<Awaited<ReturnType<typeof listWorksheetRoster>>>([]);
  const localFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    Promise.all([listClassroomsByTeacher(uid), listWorksheetRoster(uid)]).then(([c, r]) => {
      if (!cancelled) {
        setClassrooms(c);
        setRosterRows(r);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const internalCandidates = useMemo(
    () => buildRosterCandidates(classrooms, rosterRows),
    [classrooms, rosterRows],
  );

  useEffect(() => {
    if (!uid || internalCandidates.length === 0) {
      setRegisterByUid({});
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, "yes" | "no"> = {};
      const withEmail = internalCandidates.filter((c) => c.emailLower?.includes("@"));
      const chunk = 6;
      for (let i = 0; i < withEmail.length; i += chunk) {
        const part = withEmail.slice(i, i + chunk);
        await Promise.all(
          part.map(async (c) => {
            try {
              const r = await lookupStudentByEmail(c.emailLower);
              if (!cancelled) next[c.studentUid] = r.registered ? "yes" : "no";
            } catch {
              /* skip — UI shows dash */
            }
          }),
        );
      }
      if (!cancelled) setRegisterByUid(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, internalCandidates]);

  useEffect(() => {
    if (!signalReportId || !uid) {
      setLoadNote(signalReportId ? null : "Signal Logic 저장 리포트 없이도 지문만으로 배포할 수 있습니다.");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadNote("분석 리포트 불러오는 중…");
      try {
        const snap = await getDoc(doc(db, "users", uid, "signal_logic_reports", signalReportId));
        if (cancelled) return;
        if (!snap.exists()) {
          setLoadNote("해당 분석 리포트를 찾을 수 없습니다. 지문을 직접 입력하거나 로컬 파일을 첨부하세요.");
          return;
        }
        const d = snap.data();
        const p = typeof d.passage === "string" ? d.passage : "";
        const a = d.analysis as SignalLogicAnalysisReportJson | undefined;
        setPassage(p);
        if (a && a.schemaVersion === 1) {
          const norm = normalizeAnalysisReport(a);
          setAnalysis(norm);
          setSignalBundle({ passage: p, analysis: norm });
          setTitle(a.topicThesis.slice(0, 72) + (a.topicThesis.length > 72 ? "…" : ""));
          setContentSource("ai");
          setLocalAttachment(null);
          setAttachmentStatus(
            "AI 분석 학습지가 연결되었습니다. (Firestore의 시그널 로그 리포트는 그대로 두고, 과제에만 참조가 붙습니다.)",
          );
        } else {
          setAnalysis(null);
          setSignalBundle(null);
          setContentSource(null);
          setAttachmentStatus("리포트에 분석 JSON이 없습니다. 로컬 파일 첨부 또는 지문 직접 입력을 이용하세요.");
        }
        setLoadNote("분석 리포트를 불러왔습니다.");
      } catch (e) {
        setLoadNote(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signalReportId, uid]);

  const toggleStudent = (id: string) => {
    setSelectedStudentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const attachAi = useCallback(() => {
    if (signalBundle) {
      setPassage(signalBundle.passage);
      setAnalysis(signalBundle.analysis);
      setContentSource("ai");
      setLocalAttachment(null);
      setAttachmentStatus(
        "Signal Logic 분석 결과를 학습지에 다시 연결했습니다. (원본 리포트 문서는 삭제하지 않습니다.)",
      );
    } else {
      if (analysis) {
        setContentSource("ai");
        setLocalAttachment(null);
        setAttachmentStatus("현재 편집 중인 분석·지문을 AI 학습지로 사용합니다.");
      } else {
        setAttachmentStatus("저장된 Signal Logic 리포트가 없습니다. URL에 signalReportId가 있는지 확인하세요.");
      }
    }
  }, [signalBundle, analysis]);

  const onPickLocalFile = useCallback(async () => {
    localFileRef.current?.click();
  }, []);

  const onLocalFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !uid) return;
      setBusy(true);
      setMsg(null);
      try {
        const text = await extractWorksheetPassageFromUpload(file);
        const safe = file.name.replace(/[^\w.-]/g, "_").slice(0, 120);
        const storagePath = `worksheet_uploads/${uid}/${Date.now()}_${safe}`;
        const sref = ref(storage, storagePath);
        await uploadBytes(sref, file);
        setPassage(text);
        setAnalysis(minimalAnalysisForAssignment(title));
        setLocalAttachment({ storagePath, originalName: file.name });
        setContentSource("local");
        setAttachmentStatus(`로컬 파일 연결: ${file.name} — 추출한 본문이 지문란에 들어갔습니다. 필요하면 수정하세요.`);
      } catch (err) {
        setMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [uid, title],
  );

  const onSubmit = useCallback(
    async (ev: React.FormEvent) => {
      ev.preventDefault();
      if (!uid) return;
      if (!contentSource) {
        setMsg("과제물 준비에서「AI 분석 학습지 첨부」또는「로컬 파일 직접 첨부」를 먼저 선택해 주세요.");
        return;
      }
      const p = passage.trim();
      if (!p) {
        setMsg("지문이 비어 있습니다.");
        return;
      }
      const dist = new Date(distributedLocal);
      if (Number.isNaN(dist.getTime())) {
        setMsg("배포 일시가 올바르지 않습니다.");
        return;
      }
      const an = analysis ?? minimalAnalysisForAssignment(title);
      const items = analysis ? buildWorksheetItemsFromAnalysis(analysis) : buildDefaultWorksheetItems();

      setBusy(true);
      setMsg(null);
      setToast(null);
      try {
        if (deployTrack === "internal") {
          const targets = [...new Set(selectedStudentIds.map((s) => s.trim()).filter((s) => s.length >= 8))];
          if (targets.length === 0) {
            setMsg("내부 강의실 배포: 학생을 한 명 이상 체크해 주세요.");
            setBusy(false);
            return;
          }
          const id = await createWorksheetAssignment({
            teacherId: uid,
            title: title.trim() || "학습지",
            passage: p,
            analysis: an,
            distributedAt: dist,
            targetStudentIds: targets,
            worksheetItems: items,
            contentSource,
            localAttachment: localAttachment ?? undefined,
          });
          setToast({ kind: "ok", text: "과제가 저장되었습니다. 학생 과제함에서 확인할 수 있습니다." });
          window.setTimeout(() => navigate(`/teacher/assignments/${id}`), 900);
        } else {
          const hasEmail = recipientRows.some((r) => r.email.trim().includes("@"));
          if (!hasEmail) {
            setMsg("외부 이메일 배포: 이메일이 있는 수신자를 한 명 이상 추가해 주세요.");
            setBusy(false);
            return;
          }
          const result = await deployWorksheetOutreach({
            title: title.trim() || "학습지",
            passage: p,
            analysis: an,
            distributedAtMs: dist.getTime(),
            worksheetItems: items,
            selectedStudentUids: [],
            recipients: recipientRows.map((r) => ({
              displayName: r.displayName,
              phone: r.phone,
              email: r.email,
            })),
            contentSource,
            localAttachment: localAttachment ?? undefined,
          });
          const attempted = result.outreachEmailAttempted ?? 0;
          const sent = result.outreachEmailCount ?? 0;
          const errs = result.outreachEmailErrors ?? [];
          if (attempted === 0) {
            setToast({
              kind: "ok",
              text: "과제가 저장되었습니다. 모든 수신 이메일이 가입 계정과 일치해 앱 과제함에만 반영되었고, 별도 메일은 발송하지 않았습니다.",
            });
          } else if (errs.length === 0) {
            setToast({ kind: "ok", text: `과제 저장 완료. 미가입 수신자 ${attempted}명에게 메일 ${sent}건을 발송했습니다.` });
          } else if (sent > 0) {
            setToast({
              kind: "warn",
              text: `과제는 저장되었으나 메일 일부 실패: 성공 ${sent}/${attempted}건. ${errs.slice(0, 2).join(" · ")}${errs.length > 2 ? " …" : ""}`,
            });
          } else {
            setToast({
              kind: "err",
              text: `메일 발송에 실패했습니다 (${attempted}건). ${errs.slice(0, 2).join(" · ")} Functions 로그: firebase functions:log`,
            });
          }
          window.setTimeout(() => navigate(`/teacher/assignments/${result.assignmentId}`), errs.length && sent === 0 ? 3200 : 1800);
        }
      } catch (err) {
        const fb = err instanceof FirebaseError ? err.message : err instanceof Error ? err.message : String(err);
        setMsg(fb);
        setToast({ kind: "err", text: fb });
      } finally {
        setBusy(false);
      }
    },
    [
      uid,
      contentSource,
      passage,
      distributedLocal,
      title,
      analysis,
      localAttachment,
      deployTrack,
      selectedStudentIds,
      recipientRows,
      navigate,
    ],
  );

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <Link to="/teacher/assignments">← 과제 목록</Link>
        <h1 className={styles.title} style={{ marginTop: "0.75rem" }}>
          학습지 배포
        </h1>
        <p className={styles.meta}>
          <strong>내부 강의실</strong>은 앱 과제함으로, <strong>외부 이메일</strong>은 메일 링크로 나뉩니다. 내 학생 명단은
          개설 강의실 멤버 UID와 선생님 주소록을 합친 목록입니다. (전체 Firebase 사용자 목록은 보안 규칙상 조회할 수
          없습니다.)
        </p>
        {loadNote ? <p className={styles.ok}>{loadNote}</p> : null}

        <div className={styles.deployTrackWrap}>
          <div className={styles.deployTabBar} role="tablist" aria-label="배포 방식">
            <button
              type="button"
              role="tab"
              className={styles.deployTab}
              aria-selected={deployTrack === "internal"}
              onClick={() => setDeployTrack("internal")}
            >
              내부 강의실 배포
            </button>
            <button
              type="button"
              role="tab"
              className={styles.deployTab}
              aria-selected={deployTrack === "external"}
              onClick={() => setDeployTrack("external")}
            >
              외부 이메일 배포
            </button>
          </div>

          {deployTrack === "internal" ? (
            <div className={styles.deployTabPanel} role="tabpanel">
              <p className={styles.internalHint}>체크한 학생에게만 과제가 생성되며, 학생 앱 과제함에 바로 표시됩니다.</p>
              {internalCandidates.length === 0 ? (
                <p className={styles.meta}>표시할 학생이 없습니다. 강의실에 멤버 UID를 넣거나 주소록을 채워 주세요.</p>
              ) : (
                <div className={styles.internalTableWrap}>
                  <table className={styles.internalTable}>
                    <thead>
                      <tr>
                        <th style={{ width: 40 }} aria-label="선택" />
                        <th>이름</th>
                        <th>이메일</th>
                        <th>가입</th>
                        <th>소속</th>
                        <th>UID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {internalCandidates.map((c) => (
                        <tr key={c.studentUid}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedStudentIds.includes(c.studentUid)}
                              onChange={() => toggleStudent(c.studentUid)}
                              aria-label={`${c.displayName} 선택`}
                            />
                          </td>
                          <td>{c.displayName}</td>
                          <td style={{ wordBreak: "break-all", fontSize: "0.8rem" }}>{c.emailLower || "—"}</td>
                          <td>
                            {!c.emailLower ? (
                              <span className={styles.regDash}>—</span>
                            ) : registerByUid[c.studentUid] === "yes" ? (
                              <span className={`${styles.regBadge} ${styles.regYes}`}>가입</span>
                            ) : registerByUid[c.studentUid] === "no" ? (
                              <span className={`${styles.regBadge} ${styles.regNo}`}>미가입</span>
                            ) : (
                              <span className={styles.regDash}>…</span>
                            )}
                          </td>
                          <td style={{ fontSize: "0.76rem", color: "#475569" }}>{c.sourceLabels.join(" · ")}</td>
                          <td style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.72rem" }}>{c.studentUid}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.deployTabPanel} role="tabpanel">
              {uid ? (
                <DistributionRecipientsPanel rows={recipientRows} onChangeRows={setRecipientRows} disabled={busy} />
              ) : null}
            </div>
          )}
        </div>

        <section className={styles.attachSection} aria-label="과제물 준비">
          <h2 className={styles.attachSectionTitle}>과제물 준비</h2>
          <div className={styles.attachRow}>
            <input ref={localFileRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => void onLocalFileChange(e)} />
            <button type="button" className={`${styles.attachBtn} ${styles.attachBtnPrimary}`} disabled={busy} onClick={attachAi}>
              AI 분석 학습지 첨부
            </button>
            <button type="button" className={styles.attachBtn} disabled={busy} onClick={() => void onPickLocalFile()}>
              로컬 파일 직접 첨부
            </button>
          </div>
          <p className={styles.attachStatus}>{attachmentStatus}</p>
        </section>

        <form onSubmit={(ev) => void onSubmit(ev)} className={styles.grid2} style={{ marginTop: "1rem" }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.itemLabel} htmlFor="as-title">
              과제 제목
            </label>
            <input id="as-title" className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.itemLabel} htmlFor="as-passage">
              지문
            </label>
            <textarea
              id="as-passage"
              className={styles.textarea}
              style={{ minHeight: "10rem" }}
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
              maxLength={120000}
            />
          </div>
          <div>
            <label className={styles.itemLabel} htmlFor="as-when">
              배포 일시
            </label>
            <input
              id="as-when"
              className={styles.input}
              type="datetime-local"
              value={distributedLocal}
              onChange={(e) => setDistributedLocal(e.target.value)}
            />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button type="submit" className="btn btn--primary btn--stack" disabled={busy}>
              {busy
                ? deployTrack === "external"
                  ? "발송 중…"
                  : "처리 중…"
                : deployTrack === "internal"
                  ? "선택 학생에게 과제 배포"
                  : "이메일로 과제 안내 발송"}
            </button>
          </div>
        </form>
        {msg ? <p className={styles.err}>{msg}</p> : null}

        {toast ? (
          <div
            className={`${styles.deployToast} ${toast.kind === "ok" ? styles.deployToastOk : toast.kind === "warn" ? styles.deployToastWarn : styles.deployToastErr}`}
            role="status"
            aria-live="polite"
          >
            {toast.text}
          </div>
        ) : null}
      </main>
    </DashboardShell>
  );
}
