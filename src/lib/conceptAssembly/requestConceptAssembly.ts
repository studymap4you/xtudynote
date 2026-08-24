import { auth } from "@/firebase/config";
import type { ConceptAssemblyResult } from "@/types/conceptAssembly";

export async function requestConceptAssembly(params: {
  questionTypes: string[];
  subject?: string;
  targetGrade?: string;
}): Promise<ConceptAssemblyResult> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인 후 개념 자료를 불러올 수 있습니다.");
  const idToken = await user.getIdToken();
  const response = await fetch("/api/concept-assembly", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      questionTypes: params.questionTypes,
      subject: params.subject || "English",
      targetGrade: params.targetGrade || "",
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    result?: ConceptAssemblyResult;
    error?: string;
  };
  if (!response.ok || !payload.result) {
    throw new Error(payload.error || "개념 자료를 불러오지 못했습니다.");
  }
  return payload.result;
}

