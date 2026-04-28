import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import type { VideoCatalogDoc } from "@/types/videoCatalog";

const COL = "video_catalog";

const THUMB_MAX_BYTES = 2 * 1024 * 1024;

function safeThumbFileName(raw: string): string {
  const base = raw.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  return base || "thumb.jpg";
}

/** 마스터 전용 — Storage `video_catalog_thumbnails/{uid}/…` */
export async function uploadVideoCatalogThumbnail(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("썸네일은 이미지 파일만 업로드할 수 있습니다.");
  }
  if (file.size > THUMB_MAX_BYTES) {
    throw new Error("썸네일은 2MB 이하로 올려 주세요.");
  }
  const name = `${Date.now()}_${safeThumbFileName(file.name)}`;
  const sref = ref(storage, `video_catalog_thumbnails/${uid}/${name}`);
  await uploadBytes(sref, file, { contentType: file.type });
  return getDownloadURL(sref);
}

export function subscribeVideoCatalog(
  onData: (rows: { id: string; data: VideoCatalogDoc }[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const rows: { id: string; data: VideoCatalogDoc }[] = [];
      snap.forEach((d) => rows.push({ id: d.id, data: d.data() as VideoCatalogDoc }));
      onData(rows);
    },
    (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
  );
}

export async function addVideoCatalogEntry(input: {
  title: string;
  watchUrl: string;
  thumbnailUrl?: string;
  description?: string;
  createdBy: string;
}): Promise<string> {
  const thumb = input.thumbnailUrl?.trim();
  const docRef = await addDoc(collection(db, COL), {
    title: input.title.trim(),
    watchUrl: input.watchUrl.trim(),
    ...(thumb ? { thumbnailUrl: thumb } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteVideoCatalogEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
