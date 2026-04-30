import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import type { DigitalMarketProductDoc } from "@/types/digitalMarketProduct";

const COL = "digital_market_products";
const IMG_MAX = 2 * 1024 * 1024;

function safeName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9._-가-힣]+/g, "_").slice(0, 120) || "img";
}

export async function uploadDigitalMarketImage(uid: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  }
  if (file.size > IMG_MAX) {
    throw new Error("이미지는 2MB 이하로 올려 주세요.");
  }
  const name = `${Date.now()}_${safeName(file.name)}`;
  const sref = ref(storage, `digital_market_images/${uid}/${name}`);
  await uploadBytes(sref, file, { contentType: file.type });
  return getDownloadURL(sref);
}

export function subscribeDigitalMarketProducts(
  onData: (rows: { id: string; data: DigitalMarketProductDoc }[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(collection(db, COL), orderBy("createdAt", "desc"), limit(100));
  return onSnapshot(
    q,
    (snap) => {
      const rows: { id: string; data: DigitalMarketProductDoc }[] = [];
      snap.forEach((d) => rows.push({ id: d.id, data: d.data() as DigitalMarketProductDoc }));
      onData(rows);
    },
    (e) => onError?.(e instanceof Error ? e : new Error(String(e))),
  );
}

export async function addDigitalMarketProduct(input: {
  title: string;
  summary: string;
  descriptionHtml: string;
  imageUrl: string;
  purchaseUrl: string;
  fulfillmentType: DigitalMarketProductDoc["fulfillmentType"];
  priceKrw: number;
  createdBy: string;
}): Promise<string> {
  const docRef = await addDoc(collection(db, COL), {
    title: input.title.trim(),
    summary: input.summary.trim(),
    descriptionHtml: input.descriptionHtml.trim(),
    imageUrl: input.imageUrl.trim(),
    purchaseUrl: input.purchaseUrl.trim(),
    fulfillmentType: input.fulfillmentType,
    priceKrw: input.priceKrw,
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function getDigitalMarketProduct(
  id: string,
): Promise<{ id: string; data: DigitalMarketProductDoc } | null> {
  const snap = await getDoc(doc(db, COL, id));
  if (!snap.exists()) return null;
  return { id: snap.id, data: snap.data() as DigitalMarketProductDoc };
}

export async function updateDigitalMarketProduct(
  id: string,
  input: {
    title: string;
    summary: string;
    descriptionHtml: string;
    imageUrl: string;
    purchaseUrl: string;
    fulfillmentType: DigitalMarketProductDoc["fulfillmentType"];
    priceKrw: number;
  },
): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    title: input.title.trim(),
    summary: input.summary.trim(),
    descriptionHtml: input.descriptionHtml.trim(),
    imageUrl: input.imageUrl.trim(),
    purchaseUrl: input.purchaseUrl.trim(),
    fulfillmentType: input.fulfillmentType,
    priceKrw: input.priceKrw,
  });
}

export async function deleteDigitalMarketProduct(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id));
}
