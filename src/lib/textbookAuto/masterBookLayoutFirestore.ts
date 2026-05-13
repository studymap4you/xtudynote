import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "@/firebase/config";
import type { MasterBookFolioBlock } from "@/lib/textbookAuto/masterBookFolio";

export const TEXTBOOK_AUTO_MASTER_LAYOUT_SCHEMA_VERSION = 1;
export const MASTER_BOOK_LAYOUT_DOC_ID = "current";

export type PersistedMasterFolioBlock =
  | { kind: "text"; text: string }
  | { kind: "image"; storagePath: string };

export type MasterBookLayoutFirestoreDoc = {
  schemaVersion: number;
  foreword: PersistedMasterFolioBlock[];
  afterword: PersistedMasterFolioBlock[];
  /** 단원 인덱스 문자열 → Storage 경로 */
  unitCovers: Record<string, string>;
  updatedAt?: unknown;
};

function normalizePersistedFolioBlocks(raw: unknown): PersistedMasterFolioBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: PersistedMasterFolioBlock[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (o.kind === "text" && typeof o.text === "string") {
      out.push({ kind: "text", text: o.text });
    } else if (o.kind === "image" && typeof o.storagePath === "string") {
      out.push({ kind: "image", storagePath: o.storagePath });
    }
  }
  return out;
}

function masterLayoutDocRef(uid: string, sessionId: string) {
  return doc(
    db,
    "users",
    uid,
    "textbook_auto_sessions",
    sessionId,
    "master_book_layout",
    MASTER_BOOK_LAYOUT_DOC_ID,
  );
}

export async function loadMasterBookLayoutDoc(
  uid: string,
  sessionId: string,
): Promise<MasterBookLayoutFirestoreDoc | null> {
  const snap = await getDoc(masterLayoutDocRef(uid, sessionId));
  if (!snap.exists()) return null;
  const x = snap.data() as Record<string, unknown>;
  const schemaVersion =
    typeof x.schemaVersion === "number" ? x.schemaVersion : TEXTBOOK_AUTO_MASTER_LAYOUT_SCHEMA_VERSION;
  const foreword = normalizePersistedFolioBlocks(x.foreword);
  const afterword = normalizePersistedFolioBlocks(x.afterword);
  const unitCovers =
    x.unitCovers !== null && typeof x.unitCovers === "object" && !Array.isArray(x.unitCovers)
      ? Object.fromEntries(
          Object.entries(x.unitCovers as Record<string, unknown>).filter(
            ([, v]) => typeof v === "string",
          ),
        ) as Record<string, string>
      : {};
  return { schemaVersion, foreword, afterword, unitCovers };
}

export async function saveMasterBookLayoutDoc(
  uid: string,
  sessionId: string,
  payload: Omit<MasterBookLayoutFirestoreDoc, "schemaVersion" | "updatedAt">,
): Promise<void> {
  await setDoc(masterLayoutDocRef(uid, sessionId), {
    schemaVersion: TEXTBOOK_AUTO_MASTER_LAYOUT_SCHEMA_VERSION,
    foreword: payload.foreword,
    afterword: payload.afterword,
    unitCovers: payload.unitCovers,
    updatedAt: serverTimestamp(),
  });
}

export async function uploadMasterLayoutImage(
  uid: string,
  sessionId: string,
  segment: string,
  file: File,
): Promise<string> {
  const name = file.name.trim().toLowerCase();
  const ext =
    name.endsWith(".png") ? "png"
    : name.endsWith(".jpg") || name.endsWith(".jpeg") ? "jpg"
    : name.endsWith(".webp") ? "webp"
    : "img";
  const path = `textbook_auto/${uid}/${sessionId}/master_layout/${segment}_${crypto.randomUUID()}.${ext}`;
  await uploadBytes(ref(storage, path), file, {
    contentType: file.type || "image/png",
  });
  return path;
}

export async function storagePathToDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

export async function persistedFolioToMasterBlocks(
  blocks: PersistedMasterFolioBlock[],
): Promise<MasterBookFolioBlock[]> {
  const out: MasterBookFolioBlock[] = [];
  for (const p of blocks) {
    if (p.kind === "text") {
      out.push({ id: crypto.randomUUID(), kind: "text", text: p.text });
    } else {
      const url = await storagePathToDownloadUrl(p.storagePath);
      out.push({
        id: crypto.randomUUID(),
        kind: "image",
        file: null,
        storagePath: p.storagePath,
        remoteUrl: url,
      });
    }
  }
  return out;
}

export async function masterFolioBlocksToPersisted(
  uid: string,
  sessionId: string,
  segmentPrefix: string,
  blocks: MasterBookFolioBlock[],
): Promise<PersistedMasterFolioBlock[]> {
  const out: PersistedMasterFolioBlock[] = [];
  let imgSeq = 0;
  for (const b of blocks) {
    if (b.kind === "text") {
      out.push({ kind: "text", text: b.text });
    } else if (b.file) {
      const path = await uploadMasterLayoutImage(uid, sessionId, `${segmentPrefix}_${imgSeq}`, b.file);
      imgSeq += 1;
      out.push({ kind: "image", storagePath: path });
    } else if (b.storagePath) {
      out.push({ kind: "image", storagePath: b.storagePath });
    }
  }
  return out;
}
