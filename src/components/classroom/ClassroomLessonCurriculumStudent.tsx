import { useState } from "react";
import { Link } from "react-router-dom";
import type { ClassroomLessonDocument } from "@/types/classroomLesson";
import {
  effectiveLessonMaterialItems,
  effectiveLessonVideoItems,
} from "@/lib/classroom/lessonMedia";
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
          const { unitTitle, title, summary } = row.data;
          const videoItems = effectiveLessonVideoItems(row.data);
          const materialItems = effectiveLessonMaterialItems(row.data);

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
                    {videoItems.length > 0 ? (
                      <div className="classroom-lesson-acc__media-group">
                        <p className="classroom-lesson-acc__media-label">영상</p>
                        <ul className="classroom-lesson-acc__media-list">
                          {videoItems.map((item, vi) => (
                            <li key={item.id}>
                              <a
                                href={item.url}
                                className="btn btn--primary btn--stack"
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {item.label?.trim()
                                  ? `${item.label.trim()} (새 창)`
                                  : `영상 ${vi + 1} (새 창)`}
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {materialItems.length > 0 ? (
                      <div className="classroom-lesson-acc__media-group">
                        <p className="classroom-lesson-acc__media-label">학습 자료</p>
                        <ul className="classroom-lesson-acc__media-list">
                          {materialItems.map((item, mi) => {
                            const cid = item.contentId?.trim() ?? "";
                            const u = item.url?.trim() ?? "";
                            const label = item.label?.trim();
                            return (
                              <li key={item.id}>
                                {cid ? (
                                  <Link
                                    to={`/content/${encodeURIComponent(cid)}`}
                                    className="btn btn--ghost btn--stack"
                                  >
                                    {label || `강의 자료·상세 (${mi + 1})`}
                                  </Link>
                                ) : null}
                                {u ? (
                                  <a
                                    href={u}
                                    className="btn btn--ghost btn--stack"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {cid
                                      ? label
                                        ? `${label.trim()} (첨부 파일)`
                                        : "첨부·링크 자료 (새 창)"
                                      : label || `학습 자료 열기 (${mi + 1})`}
                                  </a>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                    {videoItems.length === 0 && materialItems.length === 0 ? (
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
