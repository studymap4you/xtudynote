import { BRAND_APP_NAME } from "@/lib/brand";
import type { MasterBookContentMode } from "@/lib/textbookAuto/masterBookBodyBuild";
import type { TextbookSetupFileSegment, TextbookUnitContent } from "@/types/textbookAuto";
import { TextbookAutoStudentUnitsBody } from "@/components/textbookAuto/TextbookAutoPrintView";
import printStyles from "@/components/textbookAuto/textbookAutoPrint.module.css";
import styles from "@/components/textbookAuto/textbookAutoMasterBookPrint.module.css";

function PassagesBody({ passages }: { passages: string[] }) {
  return (
    <>
      {passages.map((raw, i) => (
        <article key={i} className={printStyles.unit}>
          <h2 className={printStyles.unitTitle}>제 {i + 1}단원 · 원문</h2>
          <pre className={styles.preRaw}>{raw}</pre>
        </article>
      ))}
    </>
  );
}

function FileSegmentsBody({ segments }: { segments: TextbookSetupFileSegment[] }) {
  return (
    <>
      {segments.map((s) => (
        <section key={s.id} className={styles.segmentSection}>
          <h2 className={printStyles.h2}>
            {s.fileName} · {s.extractNote}
          </h2>
          <pre className={styles.preRaw}>{s.text}</pre>
        </section>
      ))}
    </>
  );
}

/**
 * 5단계 완성본 — Word와 동일 구성(앞표지·제목·목차·본문·추가·뒷표지)을 인쇄/PDF 캡처용으로 렌더링합니다.
 */
export function TextbookAutoMasterBookPrintView({
  bookTitle,
  frontCoverUrl,
  backCoverUrl,
  tocLines,
  contentMode,
  confirmedUnits,
  sessionUnitPassages,
  contentFileSegments,
  appendixFileSegments,
}: {
  bookTitle: string;
  frontCoverUrl: string | null;
  backCoverUrl: string | null;
  tocLines: string[];
  contentMode: MasterBookContentMode;
  confirmedUnits: { unitIndex: number; unit: TextbookUnitContent }[];
  sessionUnitPassages: string[] | null;
  contentFileSegments: TextbookSetupFileSegment[];
  appendixFileSegments: TextbookSetupFileSegment[];
}) {
  const title = bookTitle.trim() || "제목 없음";

  return (
    <div className={`${styles.root} textbook-master-book-print-root`}>
      {frontCoverUrl ? (
        <div className={styles.coverWrap}>
          <img src={frontCoverUrl} alt="" className={styles.coverImg} />
        </div>
      ) : null}

      <h1 className={styles.titleCenter}>{title}</h1>
      <p className={styles.meta}>
        {BRAND_APP_NAME} · 교재 자동 생성 · 완성본 (인쇄/PDF 저장용)
      </p>

      <h2 className={styles.phaseH}>목차</h2>
      {tocLines.length === 0 ? (
        <p className={printStyles.meta}>(목차 항목 없음)</p>
      ) : (
        <ol className={styles.tocList}>
          {tocLines.map((line, i) => (
            <li key={i} className={styles.tocLi}>
              {line}
            </li>
          ))}
        </ol>
      )}

      <h2 className={styles.phaseH}>본문</h2>
      {contentMode === "session_units" ? <TextbookAutoStudentUnitsBody units={confirmedUnits} /> : null}
      {contentMode === "session_passages" && sessionUnitPassages?.length ? (
        <PassagesBody passages={sessionUnitPassages} />
      ) : null}
      {contentMode === "session_passages" && (!sessionUnitPassages || sessionUnitPassages.length === 0) ? (
        <p className={printStyles.meta}>(세션 원문 없음)</p>
      ) : null}
      {contentMode === "upload" ? (
        contentFileSegments.length > 0 ? (
          <FileSegmentsBody segments={contentFileSegments} />
        ) : (
          <p className={printStyles.meta}>(본문 파일 블록 없음)</p>
        )
      ) : null}

      <h2 className={styles.phaseH}>추가 페이지</h2>
      {appendixFileSegments.length > 0 ? (
        <FileSegmentsBody segments={appendixFileSegments} />
      ) : (
        <p className={printStyles.meta}>(추가 페이지 없음)</p>
      )}

      {backCoverUrl ? (
        <div className={styles.coverWrap}>
          <img src={backCoverUrl} alt="" className={styles.coverImg} />
        </div>
      ) : null}
    </div>
  );
}
