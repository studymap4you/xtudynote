import { CSATExplanationBlock } from "@/components/renderEngine/CSATExplanationBlock";
import { CSATPage } from "@/components/renderEngine/CSATPage";
import type { CSATExplanationRenderPage } from "@/lib/renderEngine/types";

export function CSATExplanationSectionRenderer({
  page,
  pageNumber,
  scale,
}: {
  page: CSATExplanationRenderPage;
  pageNumber: number;
  scale: number;
}) {
  return (
    <CSATPage pageNumber={pageNumber} section="PART 03 · ANSWERS & EXPLANATIONS" scale={scale}>
      {page.units.map((unit) => <CSATExplanationBlock key={unit.id} unit={unit} />)}
    </CSATPage>
  );
}
