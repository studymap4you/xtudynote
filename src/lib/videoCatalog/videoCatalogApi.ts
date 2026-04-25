import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase/config";
import type { VideoCatalogDoc } from "@/types/videoCatalog";

const COL = "video_catalog";

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
  description?: string;
  createdBy: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COL), {
    title: input.title.trim(),
    watchUrl: input.watchUrl.trim(),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
