import { useState } from "react";
import { Link } from "react-router-dom";
import type { ClassroomLessonDocument } from "@/types/classroomLesson";
import "@/pages/pages.css";

type LessonRow = { id: string; data: ClassroomLessonDocument };

export function ClassroomLessonCurriculumStudent({
  lessons,
  completedLessonIds,
  togglingLessonId,
  onToggleComplete,
}: {
  lessons: LessonRow[];
  completedLessonIds: Set<string>;
  togglingLessonId: string | null;
  onToggleComplete: (lessonId: string, completed: boolean) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  const doneCount = lessons.filter((l) => completedLessonIds.has(l.id)).length;

  return (
    <div className="classroom-lesson-acc">
      <p className="classroom-lesson-acc__progress" aria-live="polite">
        학습 진행 <strong>{doneCount}</strong> / {lessons.length} 레슨 완료
      </p>
      <ul className="classroom-lesson-acc__list">
        {lessons.map((row, idx) => {
          const done = completedLessonIds.has(row.id);
          const expanded = openId === row.id;
          const { unitTitle, title, summary, videoUrl, contentId } = row.data;
          const v = videoUrl?.trim() ?? "";
          const cid = contentId?.trim() ?? "";

          return (
            <li
              key={row.id}
              className={`classroom-lesson-acc__item${done ? " classroom-lesson-acc__item--done" : ""}`}
            >
              <div className="classroom-lesson-acc__row">
                <span className="classroom-lesson-acc__order" aria-hidden>
                  {idx + 1}
                </span>
                <label className="classroom-lesson-acc__check-wrap">
                  <input
                    type="checkbox"
                    className="classroom-lesson-acc__check"
                    checked={done}
                    disabled={!!togglingLessonId}
                    onChange={(e) => onToggleComplete(row.id, e.target.checked)}
                    aria-label={`${title} 완료 표시`}
                  />
                  <span className="classroom-lesson-acc__check-ui" aria-hidden />
                </label>
                <button
                  type="button"
                  className="classroom-lesson-acc__title-btn"
                  aria-expanded={expanded}
                  onClick={() => setOpenId((cur) => (cur === row.id ? null : row.id))}
                >
                  <span className="classroom-lesson-acc__title-text">
                    {unitTitle?.trim() ? (
                      <span className="classroom-lesson-acc__unit">{unitTitle.trim()}</span>
                    ) : null}
                    <span className="classroom-lesson-acc__title">{title}</span>
                  </span>
                  <span className="classroom-lesson-acc__chevron" aria-hidden>
                    {expanded ? "▲" : "▼"}
                  </span>
                </button>
              </div>
              {expanded ? (
                <div className="classroom-lesson-acc__detail" id={`lesson-detail-${row.id}`}>
                  {summary?.trim() ? <p className="classroom-lesson-acc__summary">{summary.trim()}</p> : null}
                  <div className="classroom-lesson-acc__actions">
                    {v ? (
                      <a
                        href={v}
                        className="btn btn--primary btn--stack"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        영상 열기 (새 창)
                      </a>
                    ) : null}
                    {cid ? (
                      <Link to={`/content/${cid}`} className="btn btn--ghost btn--stack">
                        강의 자료·상세
                      </Link>
                    ) : null}
                    {!v && !cid ? (
                      <p className="classroom-lesson-acc__no-link">연결된 링크가 없습니다. 선생님께 문의해 주세요.</p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
