import { CSATPage } from "@/components/renderEngine/CSATPage";
import { ConceptBlockRenderer } from "@/components/renderEngine/ConceptBlockRenderer";
import type { ConceptRenderPage } from "@/types/conceptAssembly";

export function ConceptSectionRenderer({
  page,
  pageNumber,
  scale,
}: {
  page: ConceptRenderPage;
  pageNumber: number;
  scale: number;
}) {
  return (
    <CSATPage pageNumber={pageNumber} section="PART 01 · CONCEPT" scale={scale}>
      {page.units.map((unit) => <ConceptBlockRenderer key={unit.id} unit={unit} />)}
    </CSATPage>
  );
}

