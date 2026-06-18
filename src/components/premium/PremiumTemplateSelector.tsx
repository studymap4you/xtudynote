import type { CSSProperties } from "react";
import type { XUniversePremiumTemplate, XUniversePremiumTemplateId } from "@/data/xuniversePremiumTemplates";
import styles from "@/components/premium/premiumTemplateSelector.module.css";

type PremiumTemplateSelectorProps = {
  templates: XUniversePremiumTemplate[];
  selectedId: XUniversePremiumTemplateId | null;
  onSelect: (id: XUniversePremiumTemplateId) => void;
  disabled?: boolean;
};

export function PremiumTemplateSelector({
  templates,
  selectedId,
  onSelect,
  disabled = false,
}: PremiumTemplateSelectorProps) {
  return (
    <div className={styles.grid} role="radiogroup" aria-label="XUniverse 프리미엄 교재 템플릿">
      {templates.map((template) => {
        const selected = template.id === selectedId;
        return (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`${styles.card}${selected ? ` ${styles.selected}` : ""}`}
            style={{ "--template-accent": template.accent } as CSSProperties}
            disabled={disabled}
            onClick={() => onSelect(template.id)}
          >
            <span className={styles.name}>{template.name}</span>
            <span className={styles.shortName}>{template.shortName}</span>
            <span className={styles.description}>{template.description}</span>
            <span className={styles.recommended}>추천: {template.recommendedFor}</span>
            <span className={styles.sections}>{template.sections.slice(0, 5).join(" · ")}</span>
          </button>
        );
      })}
    </div>
  );
}
