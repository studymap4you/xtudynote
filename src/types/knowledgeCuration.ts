export type KnowledgeSourceType = "youtube" | "paper" | "news";

/** 검색 결과 / 임시 스테이징 (아직 Firestore 미저장) */
export type KnowledgeSearchHit = {
  tempId: string;
  type: KnowledgeSourceType;
  title: string;
  url: string;
  snippet?: string;
  sourceLabel?: string;
};

/** 큐레이션에 저장된 항목 */
export type KnowledgeCurationItem = {
  id: string;
  type: KnowledgeSourceType;
  title: string;
  url: string;
  snippet?: string;
  sourceLabel?: string;
  savedAt?: unknown;
};

export type KnowledgeCurationDoc = {
  ownerId: string;
  title: string;
  topicDomain: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type KnowledgeMaterialDoc = {
  ownerId: string;
  curationId: string;
  title: string;
  bodyMarkdown: string;
  sourceItemIds: string[];
  createdAt: unknown;
};
