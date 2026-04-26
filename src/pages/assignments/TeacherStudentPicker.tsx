import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClassroomRow } from "@/lib/classroom/listTeacherClassrooms";
import { parseStudentRosterFile } from "@/lib/worksheet/parseStudentRosterFile";
import {
  addWorksheetGroup,
  buildRosterCandidates,
  deleteWorksheetGroup,
  listWorksheetGroups,
  listWorksheetRoster,
  matchImportRowsToUids,
  upsertWorksheetRosterEntry,
} from "@/lib/worksheet/teacherRosterApi";
import styles from "@/pages/assignments/teacherStudentPicker.module.css";

type Props = {
  teacherUid: string;
  classrooms: ClassroomRow[];
  selectedIds: string[];
  onChangeSelectedIds: (ids: string[]) => void;
};

export function TeacherStudentPicker({ teacherUid, classrooms, selectedIds, onChangeSelectedIds }: Props) {
  const [rosterVersion, setRosterVersion] = useState(0);
  const [rosterRows, setRosterRows] = useState<Awaited<ReturnType<typeof listWorksheetRoster>>>([]);
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof listWorksheetGroups>>>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [noteKind, setNoteKind] = useState<"ok" | "warn" | "err">("ok");
  const fileRef = useRef<HTMLInputElement>(null);

  const [advUid, setAdvUid] = useState("");
  const [advName, setAdvName] = useState("");
  const [advEmail, setAdvEmail] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [groupPick, setGroupPick] = useState("");

  const bumpRoster = useCallback(() => setRosterVersion((v) => v + 1), []);

  useEffect(() => {
    if (!teacherUid) return;
    let cancelled = false;
    (async () => {
      try {
        const [r, g] = await Promise.all([listWorksheetRoster(teacherUid), listWorksheetGroups(teacherUid)]);
        if (!cancelled) {
          setRosterRows(r);
          setGroups(g);
        }
      } catch (e) {
        if (!cancelled) {
          setNote(e instanceof Error ? e.message : String(e));
          setNoteKind("err");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teacherUid, rosterVersion]);

  const candidates = useMemo(
    () => buildRosterCandidates(classrooms, rosterRows),
    [classrooms, rosterRows],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return candidates;
    return candidates.filter(
      (c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.emailLower.includes(q) ||
        c.studentUid.toLowerCase().includes(q),
    );
  }, [candidates, q]);

  const toggle = (uid: string) => {
    const next = new Set(selectedIds);
    if (next.has(uid)) next.delete(uid);
    else next.add(uid);
    onChangeSelectedIds([...next]);
  };

  const mergeUids = (more: string[]) => {
    onChangeSelectedIds([...new Set([...selectedIds, ...more])]);
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !teacherUid) return;
    setBusy(true);
    setNote(null);
    try {
      const rows = await parseStudentRosterFile(f);
      const { matched, unmatched } = matchImportRowsToUids(rows, candidates);
      mergeUids(matched);
      if (matched.length) {
        setNote(`파일에서 ${matched.length}명을 인식해 선택에 반영했습니다.`);
        setNoteKind("ok");
      }
      if (unmatched.length) {
        const sample = unmatched
          .slice(0, 5)
          .map((u) => `${u.line}행: ${u.hint}`)
          .join(" ");
        setNote(
          (matched.length ? "일부 행은 " : "") +
            `매칭되지 않은 행이 ${unmatched.length}개 있습니다. ${sample}${unmatched.length > 5 ? " …" : ""}`,
        );
        setNoteKind(unmatched.length && !matched.length ? "err" : "warn");
      } else if (!matched.length) {
        setNote("선택 가능한 학생과 일치하는 행이 없습니다. 주소록·강의실 멤버를 먼저 채우거나 열 이름에 email / name / uid 를 넣어 주세요.");
        setNoteKind("warn");
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : String(err));
      setNoteKind("err");
    } finally {
      setBusy(false);
    }
  };

  const applyGroup = (groupId: string) => {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    mergeUids(g.data.studentUids ?? []);
    setNote(`「${g.data.name}」그룹 ${g.data.studentUids?.length ?? 0}명을 선택에 합쳤습니다.`);
    setNoteKind("ok");
  };

  const replaceWithGroup = (groupId: string) => {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    onChangeSelectedIds([...new Set(g.data.studentUids ?? [])]);
    setNote(`배포 대상을「${g.data.name}」그룹 구성원으로 바꿨습니다.`);
    setNoteKind("ok");
  };

  const saveNewGroup = async () => {
    if (!teacherUid || !newGroupName.trim()) {
      setNote("그룹 이름을 입력하세요.");
      setNoteKind("warn");
      return;
    }
    if (selectedIds.length === 0) {
      setNote("먼저 학생을 선택하세요.");
      setNoteKind("warn");
      return;
    }
    setBusy(true);
    setNote(null);
    const name = newGroupName.trim();
    try {
      await addWorksheetGroup(teacherUid, name, selectedIds);
      setNewGroupName("");
      bumpRoster();
      setNote(`그룹「${name}」을(를) 저장했습니다.`);
      setNoteKind("ok");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      setNoteKind("err");
    } finally {
      setBusy(false);
    }
  };

  const removeGroup = async (groupId: string, name: string) => {
    if (!teacherUid) return;
    if (!window.confirm(`그룹「${name}」을(를) 삭제할까요? (과제 배포 기록에는 영향 없음)`)) return;
    setBusy(true);
    try {
      await deleteWorksheetGroup(teacherUid, groupId);
      bumpRoster();
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      setNoteKind("err");
    } finally {
      setBusy(false);
    }
  };

  const addAdvancedUid = async () => {
    const uid = advUid.trim();
    if (uid.length < 8) {
      setNote("학생 Firebase UID(8자 이상)를 입력하세요.");
      setNoteKind("warn");
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      if (teacherUid) {
        await upsertWorksheetRosterEntry(teacherUid, {
          studentUid: uid,
          displayName: advName.trim() || undefined,
          emailLower: advEmail.trim().toLowerCase() || undefined,
        });
        bumpRoster();
      }
      mergeUids([uid]);
      setAdvUid("");
      setAdvName("");
      setAdvEmail("");
      setNote("주소록에 반영하고 선택 목록에 추가했습니다.");
      setNoteKind("ok");
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
      setNoteKind("err");
    } finally {
      setBusy(false);
    }
  };

  const selectAllFiltered = () => {
    mergeUids(filtered.map((c) => c.studentUid));
  };

  const clearSelection = () => onChangeSelectedIds([]);

  return (
    <section className={styles.panel} aria-label="대상 학생 선택">
      <h2 className={styles.panelTitle}>가입 학생 (UID·주소록)</h2>
      <p className={styles.panelSub}>
        Firebase에 가입된 학생 UID를 검색·체크하거나, 엑셀/CSV로 UID를 맞춰 넣을 수 있습니다. 위「연락처로 배포」와 함께
        쓰면 가입자는 과제함·미가입자는 이메일로 나뉩니다.
      </p>

      <div className={styles.toolbar}>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" hidden onChange={(ev) => void onPickFile(ev)} />
        <button
          type="button"
          className={styles.fileBtn}
          disabled={busy || !teacherUid}
          onClick={() => fileRef.current?.click()}
        >
          파일로 명단 불러오기
        </button>
        <button type="button" className={styles.ghostBtn} disabled={busy} onClick={selectAllFiltered}>
          보이는 목록 전체 선택
        </button>
        <button type="button" className={styles.ghostBtn} disabled={busy || !selectedIds.length} onClick={clearSelection}>
          선택 비우기
        </button>
      </div>

      <div className={styles.groupRow}>
        <span style={{ fontSize: "0.82rem", color: "#475569", fontWeight: 600 }}>그룹</span>
        <select
          className={styles.groupSelect}
          aria-label="저장된 그룹"
          value={groupPick}
          onChange={(e) => {
            const v = e.target.value;
            setGroupPick("");
            if (!v) return;
            if (v.startsWith("merge:")) applyGroup(v.slice(6));
            if (v.startsWith("only:")) replaceWithGroup(v.slice(5));
          }}
        >
          <option value="">그룹 적용…</option>
          {groups.map((g) => (
            <option key={g.id} value={`merge:${g.id}`}>
              「{g.data.name}」합치기 (+{g.data.studentUids?.length ?? 0})
            </option>
          ))}
          {groups.length ? <option disabled>────────</option> : null}
          {groups.map((g) => (
            <option key={`o-${g.id}`} value={`only:${g.id}`}>
              「{g.data.name}」만 선택
            </option>
          ))}
        </select>
        <input
          className={styles.inlineInput}
          placeholder="새 그룹 이름"
          value={newGroupName}
          onChange={(e) => setNewGroupName(e.target.value)}
          maxLength={80}
        />
        <button type="button" className={styles.ghostBtn} disabled={busy} onClick={() => void saveNewGroup()}>
          현재 선택으로 그룹 저장
        </button>
      </div>

      {groups.length > 0 ? (
        <div className={styles.groupsAdmin}>
          저장된 그룹:
          {groups.map((g) => (
            <span key={g.id} className={styles.groupChip}>
              {g.data.name} ({g.data.studentUids?.length ?? 0})
              <button type="button" title="그룹 삭제" aria-label={`${g.data.name} 삭제`} onClick={() => void removeGroup(g.id, g.data.name)}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={styles.searchRow}>
        <input
          className={styles.searchInput}
          placeholder="이름·이메일·UID로 검색…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="학생 검색"
        />
      </div>

      <div className={styles.listWrap} role="list">
        {filtered.length === 0 ? (
          <div className={styles.row} style={{ color: "#64748b" }}>
            표시할 학생이 없습니다. 강의실에 멤버 UID를 넣거나, 아래에서 UID를 주소록에 추가하세요.
          </div>
        ) : (
          filtered.map((c) => (
            <label key={c.studentUid} className={styles.row} role="listitem">
              <input type="checkbox" checked={selectedSet.has(c.studentUid)} onChange={() => toggle(c.studentUid)} />
              <span className={styles.rowMain}>
                <span className={styles.rowName}>{c.displayName}</span>
                <div className={styles.rowMeta}>
                  {c.emailLower ? <span>{c.emailLower}</span> : null}
                  {c.emailLower ? <span> · </span> : null}
                  <span className="mono" style={{ fontFamily: "ui-monospace, monospace" }}>
                    {c.studentUid}
                  </span>
                </div>
                {c.sourceLabels.length ? <div className={styles.rowLabels}>{c.sourceLabels.join(" · ")}</div> : null}
              </span>
            </label>
          ))
        )}
      </div>

      <div className={styles.summary}>
        선택된 학생 <strong>{selectedIds.length}</strong>명
        {selectedIds.length > 0 && selectedIds.length <= 6 ? (
          <span style={{ color: "#64748b" }}> ({selectedIds.join(", ")})</span>
        ) : null}
      </div>

      {note ? (
        <p className={noteKind === "ok" ? styles.noteOk : noteKind === "warn" ? styles.noteWarn : styles.noteErr}>{note}</p>
      ) : null}

      <div className={styles.advanced}>
        <div className={styles.advancedTitle}>주소록에 없는 학생 UID 직접 추가 (이름·이메일은 매칭용으로만 저장)</div>
        <div className={styles.searchRow}>
          <input className={styles.searchInput} placeholder="학생 UID" value={advUid} onChange={(e) => setAdvUid(e.target.value)} />
          <input className={styles.inlineInput} placeholder="표시 이름" value={advName} onChange={(e) => setAdvName(e.target.value)} />
          <input
            className={styles.inlineInput}
            placeholder="이메일"
            type="email"
            value={advEmail}
            onChange={(e) => setAdvEmail(e.target.value)}
          />
          <button type="button" className={styles.ghostBtn} disabled={busy} onClick={() => void addAdvancedUid()}>
            추가
          </button>
        </div>
      </div>
    </section>
  );
}
