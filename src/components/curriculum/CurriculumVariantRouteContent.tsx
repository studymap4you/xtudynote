import { BookOpenCheck, School } from "lucide-react";
import { Link } from "react-router-dom";
import { CurriculumVariantWorkbookBuilder } from "@/components/curriculum/CurriculumVariantWorkbookBuilder";
import { CURRICULUM_CATALOGS } from "@/lib/curriculumResources";
import type { CurriculumVariantSeriesId } from "@/lib/curriculumVariantWorkbook";
import styles from "@/pages/curriculumResourcesPage.module.css";

const SERIES_BY_CATEGORY = Object.freeze({
  ebs_special_lecture: "ebs_special_lecture_2027_er_v2",
  ebs_complete: "ebs_complete_2027_v2",
} satisfies Record<string, CurriculumVariantSeriesId>);

export function curriculumVariantSeriesFromPath(pathname: string): CurriculumVariantSeriesId | null {
  const match = pathname.match(/^\/high-school-exams\/(ebs_special_lecture|ebs_complete)\/?$/u);
  if (!match) return null;
  return SERIES_BY_CATEGORY[match[1] as keyof typeof SERIES_BY_CATEGORY] ?? null;
}

function categoryFromSeries(seriesId: CurriculumVariantSeriesId) {
  return seriesId === "ebs_special_lecture_2027_er_v2" ? "ebs_special_lecture" : "ebs_complete";
}

export function CurriculumVariantRouteContent({ seriesId }: { seriesId: CurriculumVariantSeriesId }) {
  const catalog = CURRICULUM_CATALOGS.high_school;
  const categoryId = categoryFromSeries(seriesId);
  const selectedCategory = catalog.categories.find((category) => category.id === categoryId) ?? catalog.categories[0];

  return (
    <main className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headingIcon}><School size={23} aria-hidden /></div>
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
                </div>
              );
            })}
          </nav>
        </aside>

        <section className={styles.content} aria-labelledby="resource-category-title">
          <div className={styles.contentHeader}>
            <div>
              <span>{selectedCategory.labelEn}</span>
              <h2 id="resource-category-title">{selectedCategory.label}</h2>
            </div>
            <div className={styles.contentActions}>
              <span className={styles.count}>문항별 문제은행</span>
            </div>
          </div>

          <p className={styles.notice} role="status">
            PDF 파일을 내려받는 자료실이 아니라, 원문 번호별 변형문제를 직접 선택해 문제집을 구성하는 영역입니다.
          </p>

          <div className={styles.mockExamSection}>
            <CurriculumVariantWorkbookBuilder seriesId={seriesId} />
          </div>
        </section>
      </div>
    </main>
  );
}
