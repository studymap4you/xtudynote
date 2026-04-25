import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import type {
  KnowledgeCurationDoc,
  KnowledgeCurationItem,
  KnowledgeMaterialDoc,
  KnowledgeSearchHit,
  KnowledgeSourceType,
} from "@/types/knowledgeCuration";

const CUR = "knowledge_curations";
const MAT = "knowledge_materials";

export async function createCuration(ownerId: string, title: string, topicDomain: string): Promise<string> {
  const ref = await addDoc(collection(db, CUR), {
    ownerId,
    title: title.trim(),
    topicDomain: topicDomain.trim(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listCurations(ownerId: string): Promise<{ id: string; data: KnowledgeCurationDoc }[]> {
  const q = query(
    collection(db, CUR),
    where("ownerId", "==", ownerId),
    orderBy("createdAt", "desc"),
    limit(40),
  );
  const snap = await getDocs(q);
  const out: { id: string; data: KnowledgeCurationDoc }[] = [];
  snap.forEach((d) => out.push({ id: d.id, data: d.data() as KnowledgeCurationDoc }));
  return out;
}

function millis(at: unknown): number {
  if (at && typeof at === "object" && "toMillis" in at && typeof (at as { toMillis: () => number }).toMillis === "function") {
    return (at as { toMillis: () => number }).toMillis();
  }
  return 0;
}

export async function listCurationItems(curationId: string): Promise<KnowledgeCurationItem[]> {
  const snap = await getDocs(collection(db, CUR, curationId, "items"));
  const out: KnowledgeCurationItem[] = [];
  snap.forEach((d) => {
    const x = d.data() as Omit<KnowledgeCurationItem, "id">;
    out.push({ id: d.id, ...x });
  });
  out.sort((a, b) => millis(b.savedAt) - millis(a.savedAt));
  return out;
}

export async function appendCurationItems(
  curationId: string,
  hits: KnowledgeSearchHit[],
): Promise<void> {
  if (hits.length === 0) return;
  const batch = writeBatch(db);
  const col = collection(db, CUR, curationId, "items");
  for (const h of hits) {
    const r = doc(col);
    batch.set(r, {
      type: h.type,
      title: h.title,
      url: h.url,
      snippet: h.snippet ?? "",
      sourceLabel: h.sourceLabel ?? "",
      savedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  await updateDoc(doc(db, CUR, curationId), { updatedAt: serverTimestamp() });
}

export async function deleteCurationItems(curationId: string, itemIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  for (const id of itemIds) {
    batch.delete(doc(db, CUR, curationId, "items", id));
  }
  await batch.commit();
  await updateDoc(doc(db, CUR, curationId), { updatedAt: serverTimestamp() });
}

export async function saveKnowledgeMaterial(input: {
  ownerId: string;
  curationId: string;
  title: string;
  bodyMarkdown: string;
  sourceItemIds: string[];
}): Promise<string> {
  const ref = await addDoc(collection(db, MAT), {
    ownerId: input.ownerId,
    curationId: input.curationId,
    title: input.title.trim(),
    bodyMarkdown: input.bodyMarkdown,
    sourceItemIds: input.sourceItemIds,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listKnowledgeMaterials(ownerId: string): Promise<{ id: string; data: KnowledgeMaterialDoc }[]> {
  const q = query(
    collection(db, MAT),
    where("ownerId", "==", ownerId),
    orderBy("createdAt", "desc"),
    limit(60),
  );
  const snap = await getDocs(q);
  const out: { id: string; data: KnowledgeMaterialDoc }[] = [];
  snap.forEach((d) => out.push({ id: d.id, data: d.data() as KnowledgeMaterialDoc }));
  return out;
}

export async function getKnowledgeMaterial(id: string): Promise<KnowledgeMaterialDoc | null> {
  const s = await getDoc(doc(db, MAT, id));
  if (!s.exists()) return null;
  return s.data() as KnowledgeMaterialDoc;
}

export function buildManualHit(
  type: KnowledgeSourceType,
  title: string,
  url: string,
  snippet?: string,
): KnowledgeSearchHit {
  return {
    tempId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    title: title.trim(),
    url: url.trim(),
    snippet: snippet?.trim(),
    sourceLabel: "직접 입력",
  };
}
