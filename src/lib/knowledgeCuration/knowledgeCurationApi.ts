import {
  addDoc,
  collection,
  deleteDoc,
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
import { deleteObject, ref } from "firebase/storage";
import { db, storage } from "@/firebase/config";
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

async function deleteStorageIfFileItem(curationId: string, itemId: string): Promise<void> {
  const s = await getDoc(doc(db, CUR, curationId, "items", itemId));
  if (!s.exists()) return;
  const d = s.data() as { type?: string; storagePath?: string };
  if (d.type === "file" && d.storagePath) {
    try {
      await deleteObject(ref(storage, d.storagePath));
    } catch {
      /* 이미 삭제됨 등 */
    }
  }
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
    const payload: Record<string, unknown> = {
      type: h.type,
      title: h.title,
      url: h.url,
      snippet: h.snippet ?? "",
      sourceLabel: h.sourceLabel ?? "",
      savedAt: serverTimestamp(),
    };
    if (h.storagePath) payload.storagePath = h.storagePath;
    batch.set(r, payload);
  }
  await batch.commit();
  await updateDoc(doc(db, CUR, curationId), { updatedAt: serverTimestamp() });
}

export async function deleteCurationItems(curationId: string, itemIds: string[]): Promise<void> {
  for (const id of itemIds) {
    await deleteStorageIfFileItem(curationId, id);
  }
  const batch = writeBatch(db);
  for (const id of itemIds) {
    batch.delete(doc(db, CUR, curationId, "items", id));
  }
  await batch.commit();
  await updateDoc(doc(db, CUR, curationId), { updatedAt: serverTimestamp() });
}

const ITEM_DELETE_CHUNK = 400;

/**
 * 큐레이션 문서와 하위 items 전부 삭제. `file` 항목은 Storage 객체도 제거합니다.
 */
export async function deleteCurations(ownerId: string, curationIds: string[]): Promise<void> {
  for (const cid of curationIds) {
    const cref = doc(db, CUR, cid);
    const cs = await getDoc(cref);
    if (!cs.exists()) continue;
    const data = cs.data() as KnowledgeCurationDoc;
    if (data.ownerId !== ownerId) continue;

    const itemsSnap = await getDocs(collection(db, CUR, cid, "items"));
    const itemDocs = itemsSnap.docs;
    for (let i = 0; i < itemDocs.length; i += ITEM_DELETE_CHUNK) {
      const chunk = itemDocs.slice(i, i + ITEM_DELETE_CHUNK);
      for (const d of chunk) {
        const it = d.data() as { type?: string; storagePath?: string };
        if (it.type === "file" && it.storagePath) {
          try {
            await deleteObject(ref(storage, it.storagePath));
          } catch {
            /* */
          }
        }
      }
      const batch = writeBatch(db);
      for (const d of chunk) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
    await deleteDoc(cref);
  }
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

export function buildFileHit(input: {
  title: string;
  downloadUrl: string;
  storagePath: string;
  originalName?: string;
}): KnowledgeSearchHit {
  return {
    tempId: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type: "file",
    title: input.title.trim(),
    url: input.downloadUrl,
    snippet: input.originalName ? `원본 파일명: ${input.originalName}` : undefined,
    sourceLabel: "로컬 업로드",
    storagePath: input.storagePath,
  };
}
