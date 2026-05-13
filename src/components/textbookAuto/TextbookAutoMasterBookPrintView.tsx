import { useEffect, useState } from "react";
import { BRAND_APP_NAME } from "@/lib/brand";
import type { MasterBookFolioBlock } from "@/lib/textbookAuto/masterBookFolio";
import type {
  TextbookAnswerKeyItem,
  TextbookAnswerKeyLayout,
  TextbookSetupFileSegment,
  TextbookUnitContent,
} from "@/types/textbookAuto";
import { TextbookAutoStudentUnitsBody } from "@/components/textbookAuto/TextbookAutoPrintView";
import printStyles from "@/components/textbookAuto/textbookAutoPrint.module.css";
import styles from "@/components/textbookAuto/textbookAutoMasterBookPrint.module.css";

function MasterBookFolioImage({
  file,
  remoteUrl,
}: {
  file: File | null;
  remoteUrl?: string | null;
}) {
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setBlobSrc(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setBlobSrc(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const src = blobSrc ?? remoteUrl ?? null;
  if (!src) return null;
  return <img src={src} alt="" className={styles.folioImg} />;
}

function FolioBlocksPrint({ blocks }: { blocks: MasterBookFolioBlock[] }) {
  if (!blocks.length) return null;
  return (
    <>
      {blocks.map((b) => (
        <div key={b.id} className={printStyles.printBlock}>
          {b.kind === "text" ? (
            b.text.trim() ? (
              <pre className={styles.folioText}>{b.text}</pre>
            ) : null
          ) : (
            <MasterBookFolioImage file={b.file} remoteUrl={b.remoteUrl} />
          )}
        </div>
      ))}
    </>
  );
}

function FileSegmentsBody({ segments }: { segments: TextbookSetupFileSegment[] }) {
  return (
    <>
      {segments.map((s) => (
        <section key={s.id} className={styles.segmentSection}>
          <h2 className={`${printStyles.h2} ${printStyles.printBlock}`}>
            {s.fileName} · {s.extractNote}
          </h2>
          <pre className={styles.preRaw}>{s.text}</pre>
        </section>
      ))}
    </>
  );
}

/**
 * 5단계 완성본 — Word와 동일 구성(앞표지·제목·머리말·목차·본문·추가·꼬리말·뒷표지)을 인쇄/PDF 캡처용으로 렌더링합니다.
 */
export function TextbookAutoMasterBookPrintView({
  bookTitle,
  frontCoverUrl,
  backCoverUrl,
  tocLines,
  bodyUnits,
  appendixFileSegments,
  forewordBlocks,
  afterwordBlocks,
  unitCoverFiles,
  unitCoverUrls,
  answerKeyLayout = "appendix",
  answerKeyItems = [],
}: {
  bookTitle: string;
  frontCoverUrl: string | null;
  backCoverUrl: string | null;
  tocLines: string[];
  bodyUnits: { unitIndex: number; unit: TextbookUnitContent }[];
  appendixFileSegments: TextbookSetupFileSegment[];
  forewordBlocks: MasterBookFolioBlock[];
  afterwordBlocks: MasterBookFolioBlock[];
  unitCoverFiles: Record<number, File | null>;
  unitCoverUrls?: Record<number, string>;
  answerKeyLayout?: TextbookAnswerKeyLayout;
  answerKeyItems?: TextbookAnswerKeyItem[];
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

      {forewordBlocks.length > 0 ? (
        <>
          <h2 className={styles.phaseH}>머리말</h2>
          <FolioBlocksPrint blocks={forewordBlocks} />
        </>
      ) : null}

      <h2 className={styles.phaseH}>목차</h2>
      {tocLines.length === 0 ? (
        <p className={printStyles.meta}>(목차 항목 없음)</p>
      ) : (
        <ol className={styles.tocList}>
          {tocLines.map((line, i) => (
            <li key={i} className={`${styles.tocLi} ${printStyles.printBlock}`}>
              {line}
            </li>
          ))}
        </ol>
      )}

      <h2 className={styles.phaseH}>본문</h2>
      {bodyUnits.length > 0 ? (
        <TextbookAutoStudentUnitsBody
          units={bodyUnits}
          unitCovers={unitCoverFiles}
          unitCoverUrls={unitCoverUrls}
          answerKeyItems={answerKeyItems}
          answerKeyLayout={answerKeyLayout}
        />
      ) : (
        <p className={printStyles.meta}>(포함된 단원 없음)</p>
      )}

      <h2 className={styles.phaseH}>추가 페이지</h2>
      {appendixFileSegments.length > 0 ? (
        <FileSegmentsBody segments={appendixFileSegments} />
      ) : (
        <p className={printStyles.meta}>(추가 페이지 없음)</p>
      )}

      {afterwordBlocks.length > 0 ? (
        <>
          <h2 className={styles.phaseH}>꼬리말</h2>
          <FolioBlocksPrint blocks={afterwordBlocks} />
        </>
      ) : null}

      {backCoverUrl ? (
        <div className={styles.coverWrap}>
          <img src={backCoverUrl} alt="" className={styles.coverImg} />
        </div>
      ) : null}
    </div>
  );
}
