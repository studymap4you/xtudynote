import { LEARNING_THEME_OPTIONS, type LearningThemeId } from "@/types/learningTheme";

type Props = {
  value: LearningThemeId[];
  onChange: (next: LearningThemeId[]) => void;
  disabled?: boolean;
  /** 이 테마들은 항상 선택된 채로 유지되며 해제할 수 없습니다 (테마별 등록 진입 시). */
  lockedIds?: LearningThemeId[];
  idPrefix?: string;
};

export function LearningThemeChecklist({
  value,
  onChange,
  disabled,
  lockedIds = [],
  idPrefix = "theme",
}: Props) {
  const set = new Set(value);
  const locked = new Set(lockedIds);

  function toggle(id: LearningThemeId) {
    if (disabled || locked.has(id)) return;
    if (set.has(id)) {
      onChange(value.filter((x) => x !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <fieldset className="material-register-form__fieldset">
      <legend className="material-register-form__legend">
        <span className="reg-form__label-en">Themes</span>
        <span className="reg-form__label-ko"> 테마 분류 (복수 선택 · 라이브러리 검색에 사용)</span>
      </legend>
      <div className="learning-theme-checklist">
        {LEARNING_THEME_OPTIONS.map((opt) => (
          <label key={opt.id} className="learning-theme-checklist__item">
            <input
              type="checkbox"
              id={`${idPrefix}-${opt.id}`}
              checked={set.has(opt.id)}
              disabled={disabled || locked.has(opt.id)}
              onChange={() => toggle(opt.id)}
            />
            <span className="learning-theme-checklist__text">
              <strong>{opt.titleEn}</strong>
              <span className="learning-theme-checklist__ko">{opt.titleKo}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
