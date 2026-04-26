import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { DashboardShell } from "@/components/DashboardShell";
import { useAuth } from "@/contexts/AuthContext";
import { listClassroomsByTeacher, type ClassroomRow } from "@/lib/classroom/listTeacherClassrooms";
import { db } from "@/firebase/config";
import { createWorksheetAssignment } from "@/lib/worksheet/assignmentApi";
import { buildDefaultWorksheetItems, buildWorksheetItemsFromAnalysis } from "@/lib/worksheet/buildWorksheetItems";
import { normalizeAnalysisReport } from "@/lib/signalLogic/normalizeAnalysisReport";
import { minimalAnalysisForAssignment } from "@/lib/worksheet/minimalAnalysis";
import type { SignalLogicAnalysisReportJson } from "@/types/signalLogicAnalysisReport";
import styles from "@/pages/assignments/assignmentPages.module.css";

function parseStudentIds(raw: string): string[] {
  return raw
    .split(/[\s,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

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
  const [targetsRaw, setTargetsRaw] = useState("");
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
    const existing = parseStudentIds(targetsRaw);
    const merged = [...new Set([...existing, ...incoming])];
    setTargetsRaw(merged.join("\n"));
  }, [classrooms, selectedClassroomId, targetsRaw]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!uid) return;
      const p = passage.trim();
      if (!p) {
        setMsg("지문을 입력해 주세요.");
        return;
      }
      const targets = parseStudentIds(targetsRaw);
      if (targets.length === 0) {
        setMsg("대상 학생 UID를 한 줄에 하나씩 입력하거나, 강의실 멤버를 끼워 넣어 주세요.");
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
        const id = await createWorksheetAssignment({
          teacherId: uid,
          title: title.trim() || "학습지",
          passage: p,
          analysis: an,
          distributedAt: dist,
          targetStudentIds: targets,
          worksheetItems: items,
        });
        navigate(`/teacher/assignments/${id}`);
      } catch (err) {
        setMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [uid, passage, targetsRaw, distributedLocal, title, analysis, navigate],
  );

  return (
    <DashboardShell light>
      <main className={styles.main}>
        <Link to="/teacher/assignments">← 과제 목록</Link>
        <h1 className={styles.title} style={{ marginTop: "0.75rem" }}>
          학습지 배포
        </h1>
        <p className={styles.meta}>
          대상 학생은 Firebase 로그인 UID여야 합니다. 학생은 <strong>/dashboard</strong> 과제함에서 카드를 눌러
          들어옵니다. 강의실에 멤버 UID를 저장해 두면 아래에서 한 번에 넣을 수 있습니다.
        </p>
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
          <div style={{ gridColumn: "1 / -1" }}>
            <label className={styles.itemLabel} htmlFor="as-targets">
              대상 학생 UID (줄바꿈·쉼표로 구분)
            </label>
            <textarea
              id="as-targets"
              className={styles.textarea}
              style={{ minHeight: "5rem" }}
              value={targetsRaw}
              onChange={(e) => setTargetsRaw(e.target.value)}
              placeholder="abcStudentUid123&#10;defStudentUid456"
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
