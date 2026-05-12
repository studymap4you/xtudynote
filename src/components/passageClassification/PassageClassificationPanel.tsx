import { useCallback, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  applyPhaseToggles,
  countPhaseStats,
  mergeUnits,
  parseDocument,
  type PassageUnit,
} from "@/lib/passageClassification/processor";
import { renderPassageDocumentHtml } from "@/lib/passageClassification/renderPassageHtml";
import styles from "@/pages/textbookAutoBuilder.module.css";

function localDocDownloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const SAMPLE_MANUSCRIPT = `1. 다음 글의 요지로 가장 적절한 것은?

English passage line one.
Line two.

① 선택1
② 선택2
③ 선택3
④ 선택4
⑤ 선택5

[정답 및 해설]
정답: ③
해설 문단…

[주제]
주제 한 줄

[요지]
요지 요약

[주제문]
Key sentence in English.

[직독직해]
 word / by / word
직역 줄

[확인문제]
복습 문항 (2단 HTML로 렌더)

2. 다음 빈칸에 들어갈 말로 알맞은 것은?

Second passage text.

① A
② B
③ C
④ D
⑤ E

[정답 및 해설]
정답: ②
간단 해설`;

const MERGE_SAMPLE = `[문제 1]
[직독직해]
나중에 붙인 직독직해만 보강하는 예시입니다.`;

export function PassageClassificationPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const mergeRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(1);
  const [units, setUnits] = useState<PassageUnit[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [docTitle, setDocTitle] = useState("지문 분류 결과");
  const [headerTitle, setHeaderTitle] = useState("Xtudy · 교재");
  const [footerLeft, setFooterLeft] = useState("Xtudy-Universe");
  const [footerRight, setFooterRight] = useState("내부용");
  const [includeP3, setIncludeP3] = useState(true);
  const [includeP4, setIncludeP4] = useState(true);
  const [pastedManuscript, setPastedManuscript] = useState("");

  const ingestText = useCallback((text: string, label: string) => {
    const parsed = parseDocument(text);
    if (!parsed.length) {
      setUnits(null);
      setMsg(`「${label}」에서 문제 번호(1., 2., …)를 찾지 못했습니다.`);
      return;
    }
    setUnits(parsed);
    const { p3, p4 } = countPhaseStats(parsed);
    setIncludeP3(p3 > 0);
    setIncludeP4(p4 > 0);
    setMsg(`「${label}」을(를) 불러왔습니다.`);
    setPastedManuscript(text);
  }, []);

  const onFileChosen = useCallback(
    async (f: File) => {
      if (!f.name.toLowerCase().endsWith(".txt")) {
        setMsg(".txt 파일만 올려 주세요.");
        return;
      }
      try {
        const text = await f.text();
        ingestText(text, f.name);
      } catch {
        setMsg("파일을 읽지 못했습니다.");
      }
    },
    [ingestText],
  );

  const onUploadMain = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (f) await onFileChosen(f);
    },
    [onFileChosen],
  );

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const onDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) await onFileChosen(f);
    },
    [onFileChosen],
  );

  const onMergeUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f || !units?.length) return;
      try {
        const patch = await f.text();
        setUnits(mergeUnits(units, patch));
        setMsg(`병합 파일「${f.name}」을(를) 적용했습니다.`);
      } catch {
        setMsg("병합 파일을 읽지 못했습니다.");
      }
    },
    [units],
  );

  const stats = useMemo(() => (units?.length ? countPhaseStats(units) : null), [units]);

  const toggledUnits = useMemo(
    () => (units?.length ? applyPhaseToggles(units, includeP3, includeP4) : []),
    [units, includeP3, includeP4],
  );

  const previewHtml = useMemo(
    () =>
      toggledUnits.length
        ? renderPassageDocumentHtml(toggledUnits, {
            title: docTitle,
            headerTitle,
            footerLeft,
            footerRight,
          })
        : "",
    [toggledUnits, docTitle, headerTitle, footerLeft, footerRight],
  );

  const samplePhase4Body = useMemo(() => {
    if (!units) return "";
    const u = units.find((x) => x.phase4);
    return u?.phase4?.body?.trim() ?? "";
  }, [units]);

  const resetAll = useCallback(() => {
    setStep(1);
    setUnits(null);
    setMsg(null);
    setPastedManuscript("");
    setDocTitle("지문 분류 결과");
    setHeaderTitle("Xtudy · 교재");
    setFooterLeft("Xtudy-Universe");
    setFooterRight("내부용");
    setIncludeP3(true);
    setIncludeP4(true);
  }, []);

  return (
    <section className={`${styles.card} ${styles.localPanel}`} aria-labelledby="passage-class-h">
      <h2 id="passage-class-h" className={styles.cardTitle}>
        지문 분류 · 모듈형 작업실
      </h2>
      <p className={styles.localPanelLead}>
        이 탭에서는 <strong>브라우저만으로</strong> 원고를 올리고, Phase별 구성·프리뷰·HTML/JSON 내보내기까지 할 수 있습니다. 서버나 외부 API를
        거치지 않습니다. (로컬 전용 Streamlit은 저장소의 <span className={styles.pathChip}>streamlit_app.py</span>도 그대로 사용할 수
        있습니다.)
      </p>

      <div className={styles.passageStepBar} role="list" aria-label="진행 단계">
        {(["원고 업로드", "모듈 구성", "디자인 프리뷰", "생성"] as const).map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          const cls = [styles.passageStepCell];
          if (done) cls.push(styles.passageStepDone);
          if (active) cls.push(styles.passageStepActive);
          return (
            <div key={label} className={cls.join(" ")} role="listitem">
              {n}. {label}
            </div>
          );
        })}
      </div>

      {msg ? (
        <p className={styles.ok} role="status">
          {msg}
        </p>
      ) : null}

      {/* Step 1 */}
      {step === 1 ? (
        <>
          <h3 className={styles.localSectionTitle}>1. 원고 업로드</h3>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            className={styles.visuallyHidden}
            onChange={onUploadMain}
            aria-label="원고 txt 선택"
          />

          <label className={styles.field}>
            <span className={styles.label}>원고 직접 입력 (붙여넣기 · 수정 가능)</span>
            <textarea
              className={styles.localManuscript}
              rows={10}
              value={pastedManuscript}
              onChange={(e) => setPastedManuscript(e.target.value)}
              placeholder={
                "1. 문제 줄…\n\n지문…\n\n① 보기…\n…\n\n[정답 및 해설] 또는 정답: ③ 처럼 괄호 없이 적어도 인식합니다."
              }
              spellCheck={false}
            />
          </label>
          <div className={styles.localActionRow}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => ingestText(pastedManuscript, "직접 입력")}
              disabled={!pastedManuscript.trim()}
            >
              입력 내용으로 분석
            </button>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => {
                setPastedManuscript(SAMPLE_MANUSCRIPT);
                ingestText(SAMPLE_MANUSCRIPT, "예시 원고");
              }}
            >
              예시 원고 넣기
            </button>
          </div>
          <p className={styles.hint}>
            선택지 줄은 ①~⑤로 시작하면 되며 ①. 처럼 마침표가 있어도 됩니다. 「정답:」「[해설]」「【정답 및 해설】」 등도 인식합니다. 번호만 매긴 해설 블록(선택지 없음)은 자동으로 앞 문항의 해설에 붙입니다.
          </p>

          <div
            className={`${styles.passageDrop} ${dragOver ? styles.passageDropActive : ""}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileRef.current?.click();
              }
            }}
          >
            <p className={styles.passageDropTitle}>여기에 원고를 끌어다 놓으세요</p>
            <p className={styles.passageDropHint}>또는 이 영역을 클릭해 .txt 파일을 선택하세요.</p>
          </div>

          {stats ? (
            <>
              <p className={styles.p}>
                <strong>문제(지문 세트) {stats.n}개</strong>가 감지되었습니다. 정답·해설(Phase2){" "}
                <strong>{stats.p2}개</strong>, 심층 분석(Phase3) <strong>{stats.p3}개</strong>, 확인 문제(Phase4){" "}
                <strong>{stats.p4}개</strong>.
              </p>
              <div className={styles.passageMetricRow}>
                {(
                  [
                    ["Phase 1 · 문제지", `${stats.n}세트`],
                    ["Phase 2 · 해설", `${stats.p2}/${stats.n}`],
                    ["Phase 3 · 분석", `${stats.p3}/${stats.n}`],
                    ["Phase 4 · 확인", `${stats.p4}/${stats.n}`],
                  ] as const
                ).map(([lab, val]) => (
                  <div key={lab} className={styles.passageMetricCard}>
                    <p className={styles.passageMetricLabel}>{lab}</p>
                    <p className={styles.passageMetricValue}>{val}</p>
                  </div>
                ))}
              </div>

              <fieldset className={styles.localDivider} style={{ border: "none", padding: 0, margin: 0 }}>
                <legend className={styles.localSectionTitle}>중간 확인</legend>
                <p className={styles.localPanelLead}>
                  주제·요지 등 심층 분석(Phase3) 블록도 최종 교재에 포함하시겠습니까?
                </p>
                <div className={styles.row}>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="mid-p3"
                      checked={includeP3}
                      onChange={() => setIncludeP3(true)}
                      disabled={stats.p3 === 0}
                    />
                    예 (데이터 {stats.p3 === 0 ? "없음" : "있음"})
                  </label>
                  <label className={styles.radioLabel}>
                    <input type="radio" name="mid-p3" checked={!includeP3} onChange={() => setIncludeP3(false)} />
                    아니요
                  </label>
                </div>
                {stats.p3 === 0 ? (
                  <p className={styles.hint}>Phase3 앵커가 없습니다. 나중에 병합으로 추가할 수 있습니다.</p>
                ) : null}

                <p className={styles.localPanelLead}>확인 문제(Phase4, 2단)도 포함할까요?</p>
                <div className={styles.row}>
                  <label className={styles.radioLabel}>
                    <input
                      type="radio"
                      name="mid-p4"
                      checked={includeP4}
                      onChange={() => setIncludeP4(true)}
                      disabled={stats.p4 === 0}
                    />
                    예 (데이터 {stats.p4 === 0 ? "없음" : "있음"})
                  </label>
                  <label className={styles.radioLabel}>
                    <input type="radio" name="mid-p4" checked={!includeP4} onChange={() => setIncludeP4(false)} />
                    아니요
                  </label>
                </div>
                {stats.p4 === 0 ? (
                  <p className={styles.hint}>[확인문제] 또는 [Review] 블록이 없습니다. 병합으로 추가할 수 있습니다.</p>
                ) : null}
              </fieldset>

              <div className={styles.localActionRow}>
                <button type="button" className={styles.btnPrimary} onClick={() => setStep(2)}>
                  다음: 모듈 구성
                </button>
                <button type="button" className={styles.btnGhost} onClick={resetAll}>
                  초기화
                </button>
              </div>
            </>
          ) : (
            <p className={styles.hint}>원고를 올리면 즉시 파싱되고 위에 요약이 표시됩니다.</p>
          )}
        </>
      ) : null}

      {step >= 2 && units?.length ? (
        <>
          {step === 2 ? (
            <>
              <h3 className={styles.localSectionTitle}>2. 모듈 구성</h3>
              <div className={styles.passageLayout}>
                <div>
                  <table className={styles.passageTable}>
                    <thead>
                      <tr>
                        <th scope="col">번호</th>
                        <th scope="col">문항 요약</th>
                        <th scope="col">해설</th>
                        <th scope="col">분석</th>
                        <th scope="col">확인</th>
                      </tr>
                    </thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.number}>
                          <td>{u.number}</td>
                          <td>{(u.phase1.stem || "").slice(0, 80)}{(u.phase1.stem || "").length > 80 ? "…" : ""}</td>
                          <td>{u.phase2 ? "✓" : "—"}</td>
                          <td>{u.phase3 ? "✓" : "—"}</td>
                          <td>{u.phase4 ? "✓" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className={styles.passageToggleRow}>
                    <div className={styles.passageToggle}>
                      <label className={styles.passageToggleLabel}>
                        <input
                          type="checkbox"
                          role="switch"
                          checked={includeP3 && stats!.p3 > 0}
                          disabled={stats!.p3 === 0}
                          onChange={(e) => setIncludeP3(e.target.checked)}
                        />
                        Phase 3 출력
                      </label>
                      {stats!.p3 === 0 ? (
                        <p className={styles.passageMuted}>데이터 없음 · 병합으로 추가</p>
                      ) : null}
                    </div>
                    <div className={styles.passageToggle}>
                      <label className={styles.passageToggleLabel}>
                        <input
                          type="checkbox"
                          role="switch"
                          checked={includeP4 && stats!.p4 > 0}
                          disabled={stats!.p4 === 0}
                          onChange={(e) => setIncludeP4(e.target.checked)}
                        />
                        Phase 4 출력 (2단)
                      </label>
                      {stats!.p4 === 0 ? (
                        <p className={styles.passageMuted}>데이터 없음 · 병합으로 추가</p>
                      ) : null}
                    </div>
                  </div>

                  <input
                    ref={mergeRef}
                    type="file"
                    accept=".txt,text/plain"
                    className={styles.visuallyHidden}
                    onChange={onMergeUpload}
                    aria-label="병합 txt"
                  />
                  <div className={styles.localActionRow}>
                    <button type="button" className={styles.btnSecondary} onClick={() => mergeRef.current?.click()}>
                      병합 .txt 적용
                    </button>
                  </div>
                </div>

                <div>
                  <h4 className={styles.phase3Sub}>머릿말 · 꼬리말 (즉시 반영)</h4>
                  <label className={styles.field}>
                    <span className={styles.label}>문서 제목 (h1)</span>
                    <input className={styles.input} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>머릿말 (상단)</span>
                    <input className={styles.input} value={headerTitle} onChange={(e) => setHeaderTitle(e.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>꼬리말 왼쪽</span>
                    <input className={styles.input} value={footerLeft} onChange={(e) => setFooterLeft(e.target.value)} />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>꼬리말 오른쪽</span>
                    <input className={styles.input} value={footerRight} onChange={(e) => setFooterRight(e.target.value)} />
                  </label>
                  <div className={styles.passageLiveCard}>
                    <strong>{headerTitle || "(머릿말 없음)"}</strong>
                    <div className={styles.passageLiveFoot}>
                      {footerLeft} · {footerRight}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.localActionRow}>
                <button type="button" className={styles.btnGhost} onClick={() => setStep(1)}>
                  ← 이전
                </button>
                <button type="button" className={styles.btnPrimary} onClick={() => setStep(3)}>
                  다음: 디자인 프리뷰
                </button>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <h3 className={styles.localSectionTitle}>3. 디자인 프리뷰</h3>
              <div className={styles.passagePreviewBox}>
                <iframe title="교재 HTML 미리보기" className={styles.passagePreviewIframe} srcDoc={previewHtml} sandbox="allow-same-origin" />
              </div>
              <h4 className={styles.phase3Sub}>Phase 4 · 2단 미니 미리보기</h4>
              {samplePhase4Body ? (
                <div className={styles.passageMiniPreview}>{samplePhase4Body}</div>
              ) : (
                <p className={styles.hint}>확인 문제 본문이 없어 2단 샘플을 표시하지 않습니다.</p>
              )}
              <div className={styles.localActionRow}>
                <button type="button" className={styles.btnGhost} onClick={() => setStep(2)}>
                  ← 모듈 구성
                </button>
                <button type="button" className={styles.btnPrimary} onClick={() => setStep(4)}>
                  다음: 생성
                </button>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <h3 className={styles.localSectionTitle}>4. 생성 · 내보내기</h3>
              <p className={styles.localPanelLead}>교재 상단·하단에 들어갈 문구를 최종 확인한 뒤 파일을 내려받으세요.</p>
              <label className={styles.field}>
                <span className={styles.label}>문서 제목 (h1)</span>
                <input className={styles.input} value={docTitle} onChange={(e) => setDocTitle(e.target.value)} />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>머릿말</span>
                <input className={styles.input} value={headerTitle} onChange={(e) => setHeaderTitle(e.target.value)} />
              </label>
              <div className={styles.row} style={{ marginBottom: 0 }}>
                <label className={styles.field} style={{ flex: 1, minWidth: "140px" }}>
                  <span className={styles.label}>꼬리말 왼쪽</span>
                  <input className={styles.input} value={footerLeft} onChange={(e) => setFooterLeft(e.target.value)} />
                </label>
                <label className={styles.field} style={{ flex: 1, minWidth: "140px" }}>
                  <span className={styles.label}>꼬리말 오른쪽</span>
                  <input className={styles.input} value={footerRight} onChange={(e) => setFooterRight(e.target.value)} />
                </label>
              </div>

              <div className={styles.localActionRow}>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  onClick={() =>
                    localDocDownloadTextFile(
                      "report.html",
                      renderPassageDocumentHtml(toggledUnits, {
                        title: docTitle,
                        headerTitle,
                        footerLeft,
                        footerRight,
                      }),
                      "text/html;charset=utf-8",
                    )
                  }
                >
                  교재 생성 — report.html 받기
                </button>
                <button
                  type="button"
                  className={styles.btnSecondary}
                  onClick={() =>
                    localDocDownloadTextFile(
                      "units.json",
                      JSON.stringify(toggledUnits.map((u) => ({ ...u })), null, 2),
                      "application/json;charset=utf-8",
                    )
                  }
                >
                  units.json 받기
                </button>
                <button type="button" className={styles.btnGhost} onClick={() => setStep(3)}>
                  ← 프리뷰
                </button>
                <button type="button" className={styles.btnGhost} onClick={resetAll}>
                  처음부터
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      <hr className={styles.localDivider} />
      <h3 className={styles.localSectionTitle}>예시 · CLI (로컬 Python)</h3>
      <p className={styles.localPanelLead}>
        브라우저와 동일 규칙으로 터미널에서 처리하려면{" "}
        <span className={styles.pathChip}>document-automation/passage-classification/</span>에서 processor/renderer를 실행하면 됩니다.
      </p>
      <pre className={styles.samplePre}>
        {`python processor.py --in sample_input.txt --json out/units.json
python processor.py --in base.txt --json out/units.json --merge patch.txt
python renderer.py --json out/units.json --out out/report.html`}
      </pre>

      <div className={styles.localActionRow}>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => localDocDownloadTextFile("passage_sample.txt", SAMPLE_MANUSCRIPT, "text/plain;charset=utf-8")}
        >
          예시 원고 .txt 받기
        </button>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => localDocDownloadTextFile("passage_merge_sample.txt", MERGE_SAMPLE, "text/plain;charset=utf-8")}
        >
          병합 예시 .txt 받기
        </button>
      </div>

      <p className={styles.label}>형식 요약 (문제마다 1., 2., …, 선택지 ①~⑤)</p>
      <pre className={styles.samplePre}>{SAMPLE_MANUSCRIPT}</pre>
    </section>
  );
}
