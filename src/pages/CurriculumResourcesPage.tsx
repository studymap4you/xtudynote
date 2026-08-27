import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  BookOpenCheck,
  ChevronRight,
  Download,
  FileQuestion,
  FileText,
  GraduationCap,
  ListChecks,
  LoaderCircle,
  School,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import {
  CURRICULUM_CATALOGS,
  deleteCurriculumResource,
  listenCurriculumResources,
  uploadCurriculumResource,
} from "@/lib/curriculumResources";
import { buildCurriculumResourceFeed } from "@/lib/curriculumResourceFeed";
import { downloadStoragePathsSequentially } from "@/lib/downloads";
import {
  getOfficialExamDownloadUrl,
  loadOfficialExamResources,
  type OfficialExamFileType,
  type OfficialExamResource,
} from "@/lib/officialExamResources";
import {
  ENGLISH_MOCK_EXAM_QUESTION_NUMBERS,
  MOCK_EXAM_VARIANT_TYPES,
  createMockExamPlaceholderSessions,
  formatMockExamSession,
  sortMockExamSessionsNewestFirst,
} from "@/lib/mockExamNavigation";
import { recordStudentDownload } from "@/lib/studentDownloads";
import type {
  CurriculumCatalogId,
  CurriculumCategoryId,
  CurriculumResourceRow,
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
  if (catalog === "high_school" || catalog === "supplementary") return <School size={23} aria-hidden />;
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
  const { entitled, loading: subscriptionLoading } = useSubscription();
  const navigate = useNavigate();
  const catalog = CURRICULUM_CATALOGS[catalogId];
  const selectedCategory = catalog.categories.find((item) => item.id === categoryParam) ?? catalog.categories[0];
  const [manualRows, setManualRows] = useState<CurriculumResourceRow[]>([]);
  const [officialRows, setOfficialRows] = useState<OfficialExamResource[]>([]);
  const [manualLoading, setManualLoading] = useState(true);
  const [officialLoading, setOfficialLoading] = useState(false);
  const [error, setError] = useState("");
  const [officialError, setOfficialError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [downloadingId, setDownloadingId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedQuestionNumber, setSelectedQuestionNumber] = useState(1);
  const [selectedVariantType, setSelectedVariantType] = useState("purpose");

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
    if (!officialGrade) {
      setOfficialLoading(false);
      return () => { cancelled = true; };
    }
    setOfficialLoading(true);
    void loadOfficialExamResources(officialGrade)
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
  }, [officialGrade]);

  useEffect(() => {
    setUploadOpen(false);
  }, [selectedCategory.id]);

  const visibleManualRows = useMemo(
    () => manualRows.filter((row) => row.category === selectedCategory.id),
    [manualRows, selectedCategory.id],
  );
  const sortedOfficialRows = useMemo(
    () => {
      const matchingRows = officialRows.filter((exam) => exam.grade === officialGrade);
      if (matchingRows.length) return sortMockExamSessionsNewestFirst(matchingRows);
      if (!officialGrade || officialLoading) return [];
      return createMockExamPlaceholderSessions(officialGrade);
    },
    [officialGrade, officialLoading, officialRows],
  );
  const selectedExam = useMemo(
    () => sortedOfficialRows.find((exam) => exam.id === selectedExamId) ?? null,
    [selectedExamId, sortedOfficialRows],
  );
  const selectedVariant = MOCK_EXAM_VARIANT_TYPES.find((item) => item.id === selectedVariantType)
    ?? MOCK_EXAM_VARIANT_TYPES[0];

  useEffect(() => {
    if (!officialGrade) {
      setSelectedExamId("");
      setSelectedQuestionNumber(1);
      setSelectedVariantType("purpose");
      return;
    }
    setSelectedExamId((current) => (
      sortedOfficialRows.some((exam) => exam.id === current)
        ? current
        : sortedOfficialRows[0]?.id ?? ""
    ));
  }, [officialGrade, sortedOfficialRows]);

  useEffect(() => {
    setSelectedQuestionNumber(1);
    setSelectedVariantType("purpose");
  }, [selectedExamId]);

  const visibleResources = useMemo(
    () => buildCurriculumResourceFeed(visibleManualRows, officialRows),
    [officialRows, visibleManualRows],
  );
  const totalCount = visibleResources.length;
  const loading = manualLoading || officialLoading;
  const selectedResourceTitle = selectedCategory.label;
  const selectedResourceTitleEn = selectedCategory.labelEn;

  const downloadManual = async (row: CurriculumResourceRow) => {
    if (!firebaseUser) {
      window.alert("파일 다운로드는 로그인 후 이용할 수 있습니다.");
      return;
    }
    if (subscriptionLoading || !entitled) {
      window.alert("자료 다운로드는 구독 결제 후 이용할 수 있습니다.");
      navigate("/billing");
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
    if (!firebaseUser) {
      window.alert("파일 다운로드는 로그인 후 이용할 수 있습니다.");
      navigate("/login");
      return;
    }
    if (subscriptionLoading || !entitled) {
      window.alert("자료 다운로드는 구독 결제 후 이용할 수 있습니다.");
      navigate("/billing");
      return;
    }
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

  const renderManualResource = (row: CurriculumResourceRow, key: string) => (
    <article key={key} className={styles.resourceCard}>
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
  );

  return (
    <PublicShell>
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headingIcon}>{catalogIcon(catalogId)}</div>
          <div>
            <span>{catalog.titleEn}</span>
            <h1>{catalog.title}</h1>
          </div>
        </header>

        <div className={styles.workspace}>
          <aside className={styles.sidebar} aria-label={`${catalog.title} 분류`}>
            <div className={styles.sidebarLabel}>CATEGORY</div>
            <nav>
              {catalog.categories.map((category) => {
                const active = category.id === selectedCategory.id;
                const showExamSessions = active && Boolean(officialGrade);
                return (
                  <div
                    key={category.id}
                    className={`${styles.categoryGroup} ${active ? styles.categoryGroupActive : ""}`}
                  >
                    <Link
                      to={`${catalog.basePath}/${category.id}`}
                      className={active ? styles.categoryActive : styles.categoryLink}
                      aria-current={active ? "page" : undefined}
                    >
                      <BookOpenCheck size={18} aria-hidden />
                      <span>
                        <strong>{category.label}</strong>
                        <small>{category.labelEn}</small>
                      </span>
                    </Link>

                    {showExamSessions ? (
                      <section className={styles.examSessionNav} aria-label={`${category.label} 시험 목록`}>
                        <header>
                          <span>EXAMS</span>
                          <strong>최신순</strong>
                        </header>
                        {officialLoading ? (
                          <div className={styles.examSessionStatus}>
                            <LoaderCircle size={15} className={styles.spin} aria-hidden />
                            <span>시험 목록 불러오는 중</span>
                          </div>
                        ) : sortedOfficialRows.length ? (
                          <div className={styles.examSessionList}>
                            {sortedOfficialRows.map((exam) => (
                              <button
                                key={exam.id}
                                type="button"
                                className={exam.id === selectedExamId ? styles.examSessionActive : styles.examSessionButton}
                                onClick={() => setSelectedExamId(exam.id)}
                                aria-pressed={exam.id === selectedExamId}
                              >
                                <span>
                                  <strong>{formatMockExamSession(exam)}</strong>
                                  <small>{exam.organizer}</small>
                                </span>
                                <ChevronRight size={15} aria-hidden />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className={styles.examSessionStatus}>등록된 시험 없음</div>
                        )}
                      </section>
                    ) : null}
                  </div>
                );
              })}
            </nav>
          </aside>

          <section className={styles.content} aria-labelledby="resource-category-title">
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
            {!entitled ? <p className={styles.notice} role="status">자료 목록은 자유롭게 볼 수 있습니다. 파일 다운로드는 <Link to="/billing">구독 후 이용</Link>할 수 있습니다.</p> : null}

            {officialGrade ? (
              <div className={styles.mockExamSection}>
                {officialLoading && !selectedExam ? (
                  <div className={styles.loadingState}>
                    <LoaderCircle size={24} className={styles.spin} aria-hidden />
                    <span>시험 목록을 불러오는 중입니다.</span>
                  </div>
                ) : selectedExam ? (
                  <section className={styles.mockExamBrowser} aria-label={`${selectedResourceTitle} 문항 탐색`}>
                    <header className={styles.mockExamBrowserHeader}>
                      <div>
                        <span>SELECTED EXAM</span>
                        <h3>{selectedExam.title}</h3>
                        <p>{formatMockExamSession(selectedExam)} · 고{selectedExam.grade} · {selectedExam.organizer}</p>
                      </div>
                      <div className={styles.selectedExamActions}>
                        <span className={styles.questionTotal}>45문항</span>
                        <div className={styles.fileActions}>
                          {selectedExam.files.map((fileType) => {
                            const key = `${selectedExam.id}:${fileType}`;
                            return (
                              <button key={fileType} type="button" onClick={() => void downloadOfficial(selectedExam, fileType)} disabled={downloadingId === key}>
                                {downloadingId === key ? <LoaderCircle size={16} className={styles.spin} aria-hidden /> : <Download size={16} aria-hidden />}
                                {FILE_TYPE_LABEL[fileType]}
                              </button>
                            );
                          })}
                          {selectedExam.placeholder ? (
                            <span className={styles.filePending}>원문 자료 등록 대기</span>
                          ) : null}
                        </div>
                      </div>
                    </header>

                    <div className={styles.mockExamBrowserGrid}>
                      <section className={styles.questionPanel} aria-labelledby="mock-exam-question-heading">
                        <header className={styles.browserPanelHeader}>
                          <div>
                            <ListChecks size={19} aria-hidden />
                            <span>ALL QUESTIONS</span>
                            <h3 id="mock-exam-question-heading">전체 문항</h3>
                          </div>
                          <strong>45</strong>
                        </header>
                        <div className={styles.questionNumberGrid} aria-label="문항 번호">
                          {ENGLISH_MOCK_EXAM_QUESTION_NUMBERS.map((questionNumber) => (
                            <button
                              key={questionNumber}
                              type="button"
                              className={questionNumber === selectedQuestionNumber ? styles.questionNumberActive : styles.questionNumberButton}
                              onClick={() => setSelectedQuestionNumber(questionNumber)}
                              aria-pressed={questionNumber === selectedQuestionNumber}
                              aria-label={`${questionNumber}번 문항`}
                            >
                              {String(questionNumber).padStart(2, "0")}
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className={styles.variantPanel} aria-labelledby="mock-exam-variant-heading">
                        <header className={styles.browserPanelHeader}>
                          <div>
                            <FileQuestion size={19} aria-hidden />
                            <span>VARIANT TYPES</span>
                            <h3 id="mock-exam-variant-heading">{selectedQuestionNumber}번 변형 문제</h3>
                          </div>
                          <strong>17</strong>
                        </header>
                        <ol className={styles.variantTypeList}>
                          {MOCK_EXAM_VARIANT_TYPES.map((variant, index) => (
                            <li key={variant.id}>
                              <button
                                type="button"
                                className={variant.id === selectedVariantType ? styles.variantTypeActive : styles.variantTypeButton}
                                onClick={() => setSelectedVariantType(variant.id)}
                                aria-pressed={variant.id === selectedVariantType}
                              >
                                <span className={styles.variantIndex}>{String(index + 1).padStart(2, "0")}</span>
                                <span className={styles.variantLabel}>
                                  <strong>{variant.label}</strong>
                                  <small>{variant.labelEn}</small>
                                </span>
                                <span className={styles.variantStatus}>미등록</span>
                              </button>
                            </li>
                          ))}
                        </ol>
                        <div className={styles.variantEmptyPreview} aria-live="polite">
                          <FileQuestion size={21} aria-hidden />
                          <span>
                            <strong>{selectedQuestionNumber}번 · {selectedVariant.label}</strong>
                            <small>변형 문제 등록 대기</small>
                          </span>
                        </div>
                      </section>
                    </div>
                  </section>
                ) : (
                  <div className={styles.mockExamEmpty}>
                    <FileQuestion size={30} aria-hidden />
                    <strong>등록된 공식 모의고사가 없습니다.</strong>
                    <span>시험 파일이 등록되면 문항과 변형 유형 탐색 화면이 열립니다.</span>
                  </div>
                )}

                {visibleManualRows.length ? (
                  <section className={styles.manualResourceSection} aria-labelledby="manual-resource-heading">
                    <header>
                      <div>
                        <span>UPLOADED FILES</span>
                        <h3 id="manual-resource-heading">추가 등록 자료</h3>
                      </div>
                      <strong>{visibleManualRows.length}개</strong>
                    </header>
                    <div className={styles.resourceList}>
                      {visibleManualRows.map((row) => renderManualResource(row, `manual:${row.id}`))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : loading && totalCount === 0 ? (
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
                {visibleResources.map((resource) => {
                  if (resource.kind === "official") {
                    const { exam } = resource;
                    return (
                      <article key={resource.key} className={styles.resourceCard}>
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
                    );
                  }
                  return renderManualResource(resource.row, resource.key);
                })}
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
