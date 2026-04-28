import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import type { XtudyMarketProductDoc } from "@/types/xtudyMarketProduct";

const COL = "xtudy_market_products";
const IMG_MAX = 2 * 1024 * 1024;

function safeName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-가-힣]+/g, "_").slice(0, 120) || "img";
}

export async function uploadXtudyMarketImage(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }
  if (file.size > IMG_MAX) {
    throw new Error("이미지는 2MB 이하로 올려 주세요.");
  }
  const name = `${Date.now()}_${safeName(file.name)}`;
  const sref = ref(storage, `xtudy_market_images/${uid}/${name}`);
  await uploadBytes(sref, file, { contentType: file.type });
  return getDownloadURL(sref);
}

export function subscribeXtudyMarketProducts(
  onData: (rows: { id: string; data: XtudyMarketProductDoc }[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const rows: { id: string; data: XtudyMarketProductDoc }[] = [];
      snap.forEach((d) => rows.push({ id: d.id, data: d.data() as XtudyMarketProductDoc }));
      onData(rows);
    },
    (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
  );
}

export async function getXtudyMarketProduct(
  id: string,
): Promise<{ id: string; data: XtudyMarketProductDoc } | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, data: snap.data() as XtudyMarketProductDoc };
}

export async function addXtudyMarketProduct(input: {
  title: string;
  detailHtml: string;
  imageUrl: string;
  purchaseUrl: string;
  createdBy: string;
}): Promise<string> {
  const docRef = await addDoc(collection(db, COL), {
    title: input.title.trim(),
    detailHtml: input.detailHtml.trim(),
    imageUrl: input.imageUrl.trim(),
    purchaseUrl: input.purchaseUrl.trim(),
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}
