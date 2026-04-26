import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { listClassroomsByTeacher, type ClassroomRow } from "@/lib/classroom/listTeacherClassrooms";
import { db } from "@/firebase/config";
import { buildDefaultWorksheetItems, buildWorksheetItemsFromAnalysis } from "@/lib/worksheet/buildWorksheetItems";
import { normalizeAnalysisReport } from "@/lib/signalLogic/normalizeAnalysisReport";
import { minimalAnalysisForAssignment } from "@/lib/worksheet/minimalAnalysis";
import { deployWorksheetOutreach } from "@/lib/worksheet/worksheetOutreachCalls";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import { DistributionRecipientsPanel, type RecipientDraft } from "@/pages/assignments/DistributionRecipientsPanel";
import { TeacherStudentPicker } from "@/pages/assignments/TeacherStudentPicker";
import styles from "@/pages/assignments/assignmentPages.module.css";

export function TeacherAssignmentNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const signalReportId = params.get("signalReportId")?.trim() ?? "";
  const classroomIdParam = params.get("classroomId")?.trim() ?? "";
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid ?? "";

  const [title, setTitle] = useState("학습지 과제");
  const [passage, setPassage] = useState("");
  const [analysis, setAnalysis] = useState<SignalLogicAnalysisReportJson | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [recipientRows, setRecipientRows] = useState<RecipientDraft[]>([]);
  const [distributedLocal, setDistributedLocal] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loadNote, setLoadNote] = useState<string | null>(null);

  const [classrooms, setClassrooms] = useState<ClassroomRow[]>([]);
  const [selectedClassroomId, setSelectedClassroomId] = useState("");

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    listClassroomsByTeacher(uid).then((rows) => {
      if (!cancelled) setClassrooms(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (classroomIdParam) setSelectedClassroomId(classroomIdParam);
  }, [classroomIdParam]);

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
          setLoadNote("해당 분석 리포트를 찾을 수 없습니다. 지문을 직접 입력해 주세요.");
          return;
        }
        const d = snap.data();
        const p = typeof d.passage === "string" ? d.passage : "";
        const a = d.analysis as SignalLogicAnalysisReportJson | undefined;
        setPassage(p);
        if (a && a.schemaVersion === 1) {
          setAnalysis(normalizeAnalysisReport(a));
          setTitle(a.topicThesis.slice(0, 72) + (a.topicThesis.length > 72 ? "…" : ""));
        } else {
          setAnalysis(null);
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

  const mergeClassroomMemberIds = useCallback(() => {
    const row = classrooms.find((c) => c.id === selectedClassroomId);
    const incoming = row?.data.memberStudentIds ?? [];
    if (incoming.length === 0) {
      setMsg("선택한 강의실에 저장된 멤버 UID가 없습니다. 강의실 관리 →「학습지 멤버」에서 먼저 등록하세요.");
      return;
    }
    setMsg(null);
    setSelectedStudentIds((prev) => [...new Set([...prev, ...incoming.map((id) => String(id).trim()).filter(Boolean)])]);
  }, [classrooms, selectedClassroomId]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!uid) return;
      const p = passage.trim();
      if (!p) {
        setMsg("지문을 입력해 주세요.");
        return;
      }
      const targets = [...new Set(selectedStudentIds.map((s) => s.trim()).filter((s) => s.length >= 8))];
      const hasEmailRecipient = recipientRows.some((r) => r.email.trim().includes("@"));
      if (targets.length === 0 && !hasEmailRecipient) {
        setMsg(
          "「가입 학생(체크리스트)」에서 한 명 이상 고르거나, 연락처 명단에 이메일이 있는 행을 추가해 주세요. (이메일 없이 전화만으로는 자동 발송이 되지 않습니다.)",
        );
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
      try {
        const result = await deployWorksheetOutreach({
          title: title.trim() || "학습지",
          passage: p,
          analysis: an,
          distributedAtMs: dist.getTime(),
          worksheetItems: items,
          selectedStudentUids: targets,
          recipients: recipientRows.map((r) => ({
            displayName: r.displayName,
            phone: r.phone,
            email: r.email,
          })),
        });
        navigate(`/teacher/assignments/${result.assignmentId}`);
      } catch (err) {
        setMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [uid, passage, selectedStudentIds, recipientRows, distributedLocal, title, analysis, navigate],
  );

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <Link to="/teacher/assignments">← 과제 목록</Link>
        <h1 className={styles.title} style={{ marginTop: "0.75rem" }}>
          학습지 배포
        </h1>
        <p className={styles.meta} style={{ marginBottom: "0.65rem" }}>
          아래 <strong>과제 구성 및 발송 설정</strong>에서 A~C를 조합해 배포합니다. 연락처(전화·이메일)는 담당 교사·마스터
          계정만 조회할 수 있습니다.
        </p>

        <section className={styles.deployConfig} aria-labelledby="deploy-config-heading">
          <h2 id="deploy-config-heading" className={styles.deployConfigTitle}>
            과제 구성 및 발송 설정
          </h2>
          <p className={styles.deployConfigLead}>
            각 옵션 줄에 마우스를 올리거나(Tab으로 포커스 시) 짧은 설명이 뜹니다. 동일 안내는 브라우저 기본 툴팁에도
            들어 있습니다.
          </p>
          <ul className={styles.deployOptionList}>
            <li className={styles.deployOptionRow}>
              <span className={styles.deployOptionBadge} aria-hidden>
                A
              </span>
              <span
                className={styles.deployOptionBody}
                tabIndex={0}
                data-tooltip="가입한 학생의 UID를 대상에 넣으면, 배포 직후 해당 학생의 /dashboard 과제함에 학습지 카드가 생깁니다."
                title="가입한 학생의 UID를 대상에 넣으면, 배포 직후 해당 학생의 /dashboard 과제함에 학습지 카드가 생깁니다."
              >
                <span className={styles.deployOptionName}>
                  옵션 A: <strong>학생용 학습지 자동 생성</strong>
                </span>
                <span className={styles.deployOptionHint}>(앱 내 과제함 전달)</span>
              </span>
            </li>
            <li className={styles.deployOptionRow}>
              <span className={styles.deployOptionBadge} aria-hidden>
                B
              </span>
              <span
                className={styles.deployOptionBody}
                tabIndex={0}
                data-tooltip="과제 문서에 지문·문항과 Signal Logic 분석 JSON이 함께 저장됩니다. 학생·이메일 링크로 연 화면에서 인쇄하거나 PDF로 저장할 수 있는 출력용 학습지 레이아웃이 제공됩니다."
                title="과제 문서에 지문·문항과 Signal Logic 분석 JSON이 함께 저장됩니다. 학생·이메일 링크로 연 화면에서 인쇄하거나 PDF로 저장할 수 있는 출력용 학습지 레이아웃이 제공됩니다."
              >
                <span className={styles.deployOptionName}>
                  옵션 B: <strong>PDF 분석 리포트 생성</strong>
                </span>
                <span className={styles.deployOptionHint}>(출력용 문서 포함)</span>
              </span>
            </li>
            <li className={styles.deployOptionRow}>
              <span className={styles.deployOptionBadge} aria-hidden>
                C
              </span>
              <span
                className={styles.deployOptionBody}
                tabIndex={0}
                data-tooltip="연락처 명단의 이메일이 Firebase에 없으면, 학습지 링크가 담긴 안내 메일을 보냅니다. 발송에는 Cloud Functions와 SMTP(메일 서버) 설정이 필요합니다."
                title="연락처 명단의 이메일이 Firebase에 없으면, 학습지 링크가 담긴 안내 메일을 보냅니다. 발송에는 Cloud Functions와 SMTP(메일 서버) 설정이 필요합니다."
              >
                <span className={styles.deployOptionName}>
                  옵션 C: <strong>외부 이메일 발송</strong>
                </span>
                <span className={styles.deployOptionHint}>(미가입 학생 대상)</span>
              </span>
            </li>
          </ul>
        </section>

        {loadNote ? <p className={styles.ok}>{loadNote}</p> : null}

        <div
          style={{
            marginTop: "1rem",
            padding: "0.85rem 1rem",
            borderRadius: 10,
            border: "1px solid rgba(15, 23, 42, 0.1)",
            background: "rgba(59, 130, 246, 0.04)",
          }}
        >
          <div className={styles.itemLabel}>강의실 멤버 UID 자동 입력</div>
          <p className={styles.prompt} style={{ marginBottom: "0.5rem" }}>
            개설한 강의실을 고른 뒤「멤버 UID 끼워 넣기」를 누르면, 해당 강의실에 등록된 학생 UID가 대상 칸에 합쳐
            집니다. (중복 제거)
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <select
              className={styles.input}
              style={{ maxWidth: "100%", width: "min(420px, 100%)" }}
              value={selectedClassroomId}
              onChange={(e) => setSelectedClassroomId(e.target.value)}
              aria-label="강의실 선택"
            >
              <option value="">강의실 선택…</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.data.title}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn--ghost btn--stack" onClick={mergeClassroomMemberIds}>
              <span className="ui-ko">멤버 UID 끼워 넣기</span>
            </button>
          </div>
          {classrooms.length === 0 ? (
            <p className={styles.meta} style={{ marginTop: "0.5rem", marginBottom: 0 }}>
              등록된 강의실이 없습니다.{" "}
              <Link to="/classroom/new">강의실 개설</Link> 후 관리 화면에서 멤버 UID를 저장하세요.
            </p>
          ) : null}
        </div>

        {uid ? (
          <DistributionRecipientsPanel rows={recipientRows} onChangeRows={setRecipientRows} disabled={busy} />
        ) : null}

        {uid ? (
          <TeacherStudentPicker
            teacherUid={uid}
            classrooms={classrooms}
            selectedIds={selectedStudentIds}
            onChangeSelectedIds={setSelectedStudentIds}
          />
        ) : null}

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
              {busy ? "배포 중…" : "과제 배포"}
            </button>
          </div>
        </form>
        {msg ? <p className={styles.err}>{msg}</p> : null}
      </main>
    </DashboardShell>
  );
}
