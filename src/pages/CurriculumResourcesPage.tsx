import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BookCopy,
  BookOpenCheck,
  Download,
  FileText,
  GraduationCap,
  LoaderCircle,
  School,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { useAuth } from "@/contexts/AuthContext";
import {
  CURRICULUM_CATALOGS,
  HIGH_SCHOOL_TEXTBOOK_GROUPS,
  deleteCurriculumResource,
  listenCurriculumResources,
  uploadCurriculumResource,
} from "@/lib/curriculumResources";
import { downloadStoragePathsSequentially } from "@/lib/downloads";
import {
  getOfficialExamDownloadUrl,
  loadOfficialExamResources,
  type OfficialExamFileType,
  type OfficialExamResource,
} from "@/lib/officialExamResources";
import {
  getOfficialTextbookDownloadUrl,
  loadOfficialTextbookResources,
  type OfficialTextbookResource,
} from "@/lib/officialTextbookResources";
import { recordStudentDownload } from "@/lib/studentDownloads";
import type {
  CurriculumCatalogId,
  CurriculumCategoryId,
  CurriculumResourceRow,
  TextbookResourceCategoryId,
} from "@/types/curriculumResource";
import styles from "./curriculumResourcesPage.module.css";

const OFFICIAL_GRADE_BY_CATEGORY: Partial<Record<CurriculumCategoryId, number>> = {
  grade1_mock: 1,
  grade2_mock: 2,
  grade3_mock: 3,
};

const FILE_TYPE_LABEL: Record<OfficialExamFileType, string> = {
  question: "문제지",
  answer: "정답·해설",
  script: "듣기 대본",
};

function formatDate(timestamp: number | string | null): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatFileSize(bytes: number): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function catalogIcon(catalog: CurriculumCatalogId) {
  if (catalog === "high_school") return <School size={23} aria-hidden />;
  if (catalog === "supplementary") return <BookCopy size={23} aria-hidden />;
  return <Target size={23} aria-hidden />;
}

function ResourceUploadDialog({
  catalog,
  category,
  categoryLabel,
  uid,
  onClose,
}: {
  catalog: CurriculumCatalogId;
  category: CurriculumCategoryId;
  categoryLabel: string;
  uid: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !uploading) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, uploading]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setUploading(true);
    setProgress(0);
    setError("");
    try {
      await uploadCurriculumResource({
        uid,
        catalog,
        category,
        title,
        description,
        files,
        onProgress: setProgress,
      });
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "자료를 등록하지 못했습니다.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.dialogBackdrop} role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !uploading) onClose();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="resource-upload-title">
        <header className={styles.dialogHeader}>
          <div>
            <span>{categoryLabel}</span>
            <h2 id="resource-upload-title">자료 등록</h2>
          </div>
          <button type="button" className={styles.iconButton} onClick={onClose} disabled={uploading} title="닫기">
            <X size={20} aria-hidden />
            <span className={styles.srOnly}>닫기</span>
          </button>
        </header>

        <form className={styles.uploadForm} onSubmit={(event) => void submit(event)}>
          <label>
            <span>자료 제목</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={180} required autoFocus />
          </label>
          <label>
            <span>간단한 설명</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} maxLength={600} />
          </label>
          <label className={styles.filePicker}>
            <Upload size={20} aria-hidden />
            <span>{files.length ? `${files.length}개 파일 선택됨` : "파일 선택"}</span>
            <input
              type="file"
              multiple
              onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              disabled={uploading}
            />
          </label>
          {files.length ? (
            <ul className={styles.selectedFiles}>
              {files.map((file) => (
                <li key={`${file.name}-${file.lastModified}`}>
                  <FileText size={16} aria-hidden />
                  <span>{file.name}</span>
                  <small>{formatFileSize(file.size)}</small>
                </li>
              ))}
            </ul>
          ) : null}
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          {uploading ? (
            <div className={styles.uploadProgress} aria-live="polite">
              <div><span style={{ width: `${progress}%` }} /></div>
              <strong>{progress}%</strong>
            </div>
          ) : null}
          <div className={styles.dialogActions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={uploading}>취소</button>
            <button type="submit" className={styles.primaryButton} disabled={uploading || !title.trim() || !files.length}>
              {uploading ? <LoaderCircle size={18} className={styles.spin} aria-hidden /> : <Upload size={18} aria-hidden />}
              {uploading ? "등록 중" : "등록"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

export function CurriculumResourcesPage({ catalogId }: { catalogId: CurriculumCatalogId }) {
  const { category: categoryParam } = useParams<{ category?: string }>();
  const { firebaseUser, profile, isSuperAdmin } = useAuth();
  const catalog = CURRICULUM_CATALOGS[catalogId];
  const selectedCategory = catalog.categories.find((item) => item.id === categoryParam) ?? catalog.categories[0];
  const [manualRows, setManualRows] = useState<CurriculumResourceRow[]>([]);
  const [officialRows, setOfficialRows] = useState<OfficialExamResource[]>([]);
  const [officialTextbookRows, setOfficialTextbookRows] = useState<OfficialTextbookResource[]>([]);
  const [manualLoading, setManualLoading] = useState(true);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [officialTextbookLoading, setOfficialTextbookLoading] = useState(false);
  const [error, setError] = useState("");
  const [officialError, setOfficialError] = useState("");
  const [officialTextbookError, setOfficialTextbookError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [downloadingId, setDownloadingId] = useState("");

  useEffect(() => {
    setManualLoading(true);
    const unsubscribe = listenCurriculumResources(catalogId, isSuperAdmin, (rows) => {
      setManualRows(rows);
      setManualLoading(false);
      setError("");
    }, (listenError) => {
      setError(listenError.message || "자료 목록을 불러오지 못했습니다.");
      setManualLoading(false);
    });
    return unsubscribe;
  }, [catalogId, isSuperAdmin]);

  const officialGrade = catalogId === "high_school" ? OFFICIAL_GRADE_BY_CATEGORY[selectedCategory.id] : undefined;
  useEffect(() => {
    let cancelled = false;
    setOfficialRows([]);
    setOfficialError("");
    if (!firebaseUser || !officialGrade) {
      setOfficialLoading(false);
      return () => { cancelled = true; };
    }
    setOfficialLoading(true);
    void loadOfficialExamResources(firebaseUser, officialGrade)
      .then((items) => {
        if (!cancelled) setOfficialRows(items);
      })
      .catch((loadError) => {
        if (!cancelled) setOfficialError(loadError instanceof Error ? loadError.message : "공식 자료를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (!cancelled) setOfficialLoading(false);
      });
    return () => { cancelled = true; };
  }, [firebaseUser, officialGrade]);

  const officialTextbookCategory = catalogId === "supplementary" && selectedCategory.id.startsWith("textbook_")
    ? selectedCategory.id as TextbookResourceCategoryId
    : undefined;
  useEffect(() => {
    let cancelled = false;
    setOfficialTextbookRows([]);
    setOfficialTextbookError("");
    if (!firebaseUser || !officialTextbookCategory) {
      setOfficialTextbookLoading(false);
      return () => { cancelled = true; };
    }
    setOfficialTextbookLoading(true);
    void loadOfficialTextbookResources(firebaseUser, officialTextbookCategory)
      .then((items) => {
        if (!cancelled) setOfficialTextbookRows(items);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setOfficialTextbookError(loadError instanceof Error ? loadError.message : "교과서 자료를 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setOfficialTextbookLoading(false);
      });
    return () => { cancelled = true; };
  }, [firebaseUser, officialTextbookCategory]);

  useEffect(() => {
    setUploadOpen(false);
  }, [selectedCategory.id]);

  const visibleManualRows = useMemo(
    () => manualRows.filter((row) => row.category === selectedCategory.id),
    [manualRows, selectedCategory.id],
  );
  const totalCount = visibleManualRows.length + officialRows.length + officialTextbookRows.length;
  const loading = manualLoading || officialLoading || officialTextbookLoading;
  const isHighSchoolTextbookCatalog = catalogId === "supplementary";
  const selectedTextbookGroup = isHighSchoolTextbookCatalog
    ? HIGH_SCHOOL_TEXTBOOK_GROUPS.find((group) => group.categories.some((item) => item.id === selectedCategory.id))
    : undefined;
  const selectedResourceTitle = selectedTextbookGroup
    ? `${selectedTextbookGroup.label} · ${selectedCategory.label}`
    : selectedCategory.label;
  const selectedResourceTitleEn = selectedTextbookGroup
    ? `${selectedTextbookGroup.labelEn} · ${selectedCategory.labelEn}`
    : selectedCategory.labelEn;

  const downloadManual = async (row: CurriculumResourceRow) => {
    if (!firebaseUser) {
      window.alert("파일 다운로드는 로그인 후 이용할 수 있습니다.");
      return;
    }
    if (!row.files.length) return;
    setDownloadingId(row.id);
    try {
      await downloadStoragePathsSequentially(row.files.map((file) => file.path));
      if (profile?.role === "student") {
        await recordStudentDownload({
          studentId: firebaseUser.uid,
          contentId: row.id,
          title: row.title,
          storagePaths: row.files.map((file) => file.path),
        });
      }
    } catch (downloadError) {
      window.alert(downloadError instanceof Error ? downloadError.message : "파일을 다운로드하지 못했습니다.");
    } finally {
      setDownloadingId("");
    }
  };

  const downloadOfficial = async (exam: OfficialExamResource, fileType: OfficialExamFileType) => {
    if (!firebaseUser) return;
    const downloadKey = `${exam.id}:${fileType}`;
    setDownloadingId(downloadKey);
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const url = await getOfficialExamDownloadUrl(firebaseUser, exam.id, fileType);
      if (popup) popup.location.href = url;
      else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
      }
    } catch (downloadError) {
      popup?.close();
      window.alert(downloadError instanceof Error ? downloadError.message : "파일을 다운로드하지 못했습니다.");
    } finally {
      setDownloadingId("");
    }
  };

  const downloadOfficialTextbook = async (source: OfficialTextbookResource) => {
    if (!firebaseUser) return;
    const downloadKey = `textbook:${source.id}`;
    setDownloadingId(downloadKey);
    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    try {
      const url = await getOfficialTextbookDownloadUrl(firebaseUser, source.id);
      if (popup) popup.location.href = url;
      else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.click();
      }
    } catch (downloadError) {
      popup?.close();
      window.alert(downloadError instanceof Error ? downloadError.message : "교과서 파일을 다운로드하지 못했습니다.");
    } finally {
      setDownloadingId("");
    }
  };

  const removeManual = async (row: CurriculumResourceRow) => {
    if (!isSuperAdmin || !window.confirm(`「${row.title}」 자료와 등록된 파일을 삭제할까요?`)) return;
    setDeletingId(row.id);
    try {
      await deleteCurriculumResource(row);
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : "자료를 삭제하지 못했습니다.");
    } finally {
      setDeletingId("");
    }
  };

  return (
    <PublicShell>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headingIcon}>{catalogIcon(catalogId)}</div>
          <div>
            <span>{isHighSchoolTextbookCatalog ? "2022 REVISED CURRICULUM" : catalog.titleEn}</span>
            <h1>{isHighSchoolTextbookCatalog ? "고등 내신 2022 개정" : catalog.title}</h1>
          </div>
        </header>

        {isHighSchoolTextbookCatalog ? (
          <section className={styles.textbookCatalog} aria-labelledby="textbook-catalog-title">
            <div className={styles.textbookCatalogBar}>
              <div>
                <span>HIGH SCHOOL ENGLISH TEXTBOOKS</span>
                <h2 id="textbook-catalog-title">교과서 선택</h2>
              </div>
              <p>2022 개정 영어 교과서 자료</p>
            </div>
            <div className={styles.textbookGrid}>
              {HIGH_SCHOOL_TEXTBOOK_GROUPS.map((group) => (
                <section
                  key={group.id}
                  className={`${styles.textbookGroup} ${group.id === "general" ? styles.textbookGroupGeneral : ""}`}
                  aria-labelledby={`textbook-group-${group.id}`}
                >
                  <header>
                    <h3 id={`textbook-group-${group.id}`}>{group.label}</h3>
                    <span>{group.availableYear}년 제공</span>
                  </header>
                  <nav aria-label={`${group.label} 출판사`}>
                    {group.categories.map((category) => (
                      <Link
                        key={category.id}
                        to={`${catalog.basePath}/${category.id}`}
                        className={category.id === selectedCategory.id ? styles.textbookPublisherActive : styles.textbookPublisherLink}
                        aria-current={category.id === selectedCategory.id ? "page" : undefined}
                        title={category.labelEn}
                      >
                        {category.label}
                      </Link>
                    ))}
                  </nav>
                </section>
              ))}
            </div>
          </section>
        ) : null}

        <div className={isHighSchoolTextbookCatalog ? styles.textbookResourceWorkspace : styles.workspace}>
          {!isHighSchoolTextbookCatalog ? <aside className={styles.sidebar} aria-label={`${catalog.title} 분류`}>
            <div className={styles.sidebarLabel}>CATEGORY</div>
            <nav>
              {catalog.categories.map((category) => (
                <Link
                  key={category.id}
                  to={`${catalog.basePath}/${category.id}`}
                  className={category.id === selectedCategory.id ? styles.categoryActive : styles.categoryLink}
                  aria-current={category.id === selectedCategory.id ? "page" : undefined}
                >
                  <BookOpenCheck size={18} aria-hidden />
                  <span>
                    <strong>{category.label}</strong>
                    <small>{category.labelEn}</small>
                  </span>
                </Link>
              ))}
            </nav>
          </aside> : null}

          <section className={isHighSchoolTextbookCatalog ? `${styles.content} ${styles.textbookContent}` : styles.content} aria-labelledby="resource-category-title">
            <div className={styles.contentHeader}>
              <div>
                <span>{selectedResourceTitleEn}</span>
                <h2 id="resource-category-title">{selectedResourceTitle}</h2>
              </div>
              <div className={styles.contentActions}>
                <span className={styles.count}>{totalCount}개 자료</span>
                {isSuperAdmin && firebaseUser ? (
                  <button type="button" className={styles.primaryButton} onClick={() => setUploadOpen(true)}>
                    <Upload size={18} aria-hidden />
                    자료 등록
                  </button>
                ) : null}
              </div>
            </div>

            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            {officialError && isSuperAdmin ? <p className={styles.notice} role="status">{officialError}</p> : null}
            {officialTextbookError && isSuperAdmin ? <p className={styles.notice} role="status">{officialTextbookError}</p> : null}

            {loading && totalCount === 0 ? (
              <div className={styles.loadingState}>
                <LoaderCircle size={24} className={styles.spin} aria-hidden />
                <span>자료를 불러오는 중입니다.</span>
              </div>
            ) : totalCount === 0 ? (
              <div className={styles.emptyState}>
                <FileText size={30} aria-hidden />
                <strong>등록된 자료가 없습니다.</strong>
              </div>
            ) : (
              <div className={styles.resourceList}>
                {officialRows.map((exam) => (
                  <article key={exam.id} className={styles.resourceCard}>
                    <div className={styles.resourceIcon}><GraduationCap size={22} aria-hidden /></div>
                    <div className={styles.resourceBody}>
                      <div className={styles.resourceTitleRow}>
                        <div>
                          <span className={styles.sourceBadge}>EBSi 공식 자료</span>
                          <h3>{exam.title}</h3>
                        </div>
                        <time>{formatDate(exam.collectedAt)}</time>
                      </div>
                      <p>{exam.year}년 · 고{exam.grade} · {exam.month}월 · {exam.organizer}</p>
                      <div className={styles.fileActions}>
                        {exam.files.map((fileType) => {
                          const key = `${exam.id}:${fileType}`;
                          return (
                            <button key={fileType} type="button" onClick={() => void downloadOfficial(exam, fileType)} disabled={downloadingId === key}>
                              {downloadingId === key ? <LoaderCircle size={16} className={styles.spin} aria-hidden /> : <Download size={16} aria-hidden />}
                              {FILE_TYPE_LABEL[fileType]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                ))}

                {officialTextbookRows.map((source) => {
                  const downloadKey = `textbook:${source.id}`;
                  return (
                    <article key={downloadKey} className={styles.resourceCard}>
                      <div className={styles.resourceIcon}><BookCopy size={22} aria-hidden /></div>
                      <div className={styles.resourceBody}>
                        <div className={styles.resourceTitleRow}>
                          <div>
                            <span className={styles.sourceBadge}>Xtudy Problem Bank</span>
                            <h3>{source.title}</h3>
                          </div>
                          <time>{formatDate(source.collectedAt)}</time>
                        </div>
                        <p>{[source.courseTitle, source.publisher, source.leadAuthor].filter(Boolean).join(" · ")}</p>
                        <div className={styles.cardFooter}>
                          <button
                            type="button"
                            className={styles.downloadButton}
                            onClick={() => void downloadOfficialTextbook(source)}
                            disabled={downloadingId === downloadKey}
                          >
                            {downloadingId === downloadKey ? <LoaderCircle size={17} className={styles.spin} aria-hidden /> : <Download size={17} aria-hidden />}
                            교과서 PDF
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}

                {visibleManualRows.map((row) => (
                  <article key={row.id} className={styles.resourceCard}>
                    <div className={styles.resourceIcon}><FileText size={22} aria-hidden /></div>
                    <div className={styles.resourceBody}>
                      <div className={styles.resourceTitleRow}>
                        <div>
                          <span className={styles.sourceBadgeManual}>등록 자료</span>
                          <h3>{row.title}</h3>
                        </div>
                        <time>{formatDate(row.createdAtMs)}</time>
                      </div>
                      {row.description ? <p>{row.description}</p> : null}
                      <ul className={styles.fileList}>
                        {row.files.map((file) => (
                          <li key={file.path}>
                            <FileText size={15} aria-hidden />
                            <span>{file.name}</span>
                            <small>{formatFileSize(file.size)}</small>
                          </li>
                        ))}
                      </ul>
                      <div className={styles.cardFooter}>
                        <button type="button" className={styles.downloadButton} onClick={() => void downloadManual(row)} disabled={!row.files.length || downloadingId === row.id}>
                          {downloadingId === row.id ? <LoaderCircle size={17} className={styles.spin} aria-hidden /> : <Download size={17} aria-hidden />}
                          {row.files.length > 1 ? "전체 다운로드" : "다운로드"}
                        </button>
                        {isSuperAdmin ? (
                          <button type="button" className={styles.deleteButton} onClick={() => void removeManual(row)} disabled={deletingId === row.id} title="자료 삭제">
                            {deletingId === row.id ? <LoaderCircle size={17} className={styles.spin} aria-hidden /> : <Trash2 size={17} aria-hidden />}
                            <span className={styles.srOnly}>자료 삭제</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {uploadOpen && firebaseUser ? (
        <ResourceUploadDialog
          catalog={catalogId}
          category={selectedCategory.id}
          categoryLabel={selectedResourceTitle}
          uid={firebaseUser.uid}
          onClose={() => setUploadOpen(false)}
        />
      ) : null}
    </PublicShell>
  );
}
