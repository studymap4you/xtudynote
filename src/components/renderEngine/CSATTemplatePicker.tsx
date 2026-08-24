import { Check, Palette } from "lucide-react";
import type { CSSProperties } from "react";
import { renderTemplateList, type RenderTemplateDefinition } from "@/lib/renderEngine/templateRegistry";
import { templateCssVariables } from "@/lib/renderEngine/templates/templateTokens";
import type { CSATRenderTemplateId } from "@/lib/renderEngine/types";
import styles from "@/components/renderEngine/csatTemplatePicker.module.css";

function CSATTemplateMiniPreview({ template }: { template: RenderTemplateDefinition }) {
  if (template.previewImage) return <img className={styles.previewImage} src={template.previewImage} alt={`${template.shortName} 미리보기`} />;
  return (
    <div className={styles.previewCanvas} data-preview-template={template.id} style={templateCssVariables(template.tokens) as CSSProperties} aria-hidden="true">
      <div className={styles.previewPaper}>
        <div className={styles.previewMasthead}><i /><i /></div>
        <strong>English<br />CSAT</strong>
        <span className={styles.previewRule} />
        <div className={styles.previewQuestion}><b>01</b><span><i /><i /><i /></span></div>
        <div className={styles.previewChoices}><i /><i /><i /></div>
      </div>
    </div>
  );
}

export type CSATTemplatePickerProps = {
  value: CSATRenderTemplateId;
  onChange: (templateId: CSATRenderTemplateId) => void;
  disabled?: boolean;
};

export function CSATTemplatePicker({ value, onChange, disabled = false }: CSATTemplatePickerProps) {
  const selected = renderTemplateList.find((template) => template.id === value) || renderTemplateList[0];
  return (
    <section className={styles.picker} aria-labelledby="csat-template-picker-title">
      <header>
        <div>
          <span><Palette size={15} aria-hidden="true" /> BOOK DESIGN</span>
          <h2 id="csat-template-picker-title">교재 디자인 선택</h2>
          <p>생성된 문제의 내용은 유지하고 A4 출력 디자인과 페이지 구성만 변경합니다.</p>
        </div>
        <strong><Check size={15} aria-hidden="true" /> {selected?.shortName}</strong>
      </header>
      <div className={styles.grid} role="radiogroup" aria-label="교재 디자인 템플릿">
        {renderTemplateList.map((template) => {
          const isSelected = template.id === value;
          return (
            <button
              key={template.id}
              type="button"
              className={styles.card}
              role="radio"
              aria-checked={isSelected}
              data-selected={isSelected || undefined}
              onClick={() => onChange(template.id)}
              disabled={disabled}
            >
              <CSATTemplateMiniPreview template={template} />
              <span className={styles.cardBody}>
                <span className={styles.cardTitle}><b>{template.shortName}</b>{isSelected ? <em><Check size={13} /> 선택됨</em> : null}</span>
                <small>{template.description}</small>
                <span className={styles.recommendation}><b>추천</b> {template.recommendedFor.join(" · ")}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
