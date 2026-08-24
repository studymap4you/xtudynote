const DIRECT_COLLECTION = "concept_records";
const DIRECT_QUERY_BATCH_SIZE = 10;

function text(value, maxLength = 1_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function exactContent(value) {
  return typeof value === "string" && value.trim() ? value : "";
}

function list(value, maxItems = 60) {
  return Array.isArray(value)
    ? value.map((item) => text(item, 240)).filter(Boolean).slice(0, maxItems)
    : [];
}

function yearFrom(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric >= 1900 && numeric <= 2200) return numeric;
    const match = String(value ?? "").match(/(?:19|20|21)\d{2}/);
    if (match) return Number(match[0]);
  }
  return 0;
}

function normalizeSourceType(value, sourceTitle) {
  const normalized = text(value, 80).toUpperCase().replace(/[\s-]+/g, "_");
  if (["SUNEUNG_SPECIAL", "CSAT_SPECIAL", "EBS_SPECIAL"].includes(normalized)) return "SUNEUNG_SPECIAL";
  if (["SUNEUNG_COMPLETE", "CSAT_COMPLETE", "EBS_COMPLETE"].includes(normalized)) return "SUNEUNG_COMPLETE";
  if (["TEXTBOOK", "SCHOOL_TEXTBOOK"].includes(normalized)) return "TEXTBOOK";
  if (normalized === "INTERNAL") return "INTERNAL";
  if (/수능특강|수특|suneung special|csat special/i.test(sourceTitle)) return "SUNEUNG_SPECIAL";
  if (/수능완성|수완|suneung complete|csat complete/i.test(sourceTitle)) return "SUNEUNG_COMPLETE";
  if (/교과서|textbook/i.test(sourceTitle)) return "TEXTBOOK";
  return "INTERNAL";
}

function normalizeAllowedUse(value) {
  const normalized = text(value, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (["verbatim", "full_text", "internal_verbatim"].includes(normalized)) return "verbatim";
  if (["excerpt", "approved_excerpt"].includes(normalized)) return "excerpt";
  if (["reference_only", "reference", "metadata_only"].includes(normalized)) return "reference_only";
  return "unspecified";
}

function inferRecordId(raw, fallbackId, index) {
  return text(raw.recordId ?? raw.id, 240) || `${fallbackId}-concept-${index + 1}`;
}

function normalizeRecord(raw, fallbackId, index, parent = {}) {
  const sourceTitle = text(
    raw.sourceTitle ?? raw.source?.sourceTitle ?? parent.sourceTitle ?? parent.title ?? parent.subject,
    500,
  );
  const sourceType = normalizeSourceType(
    raw.sourceType ?? raw.source?.sourceType ?? parent.sourceType,
    sourceTitle,
  );
  const publicationYear = yearFrom(
    raw.publicationYear,
    raw.source?.publicationYear,
    parent.publicationYear,
    sourceTitle,
  );
  return {
    recordId: inferRecordId(raw, fallbackId, index),
    conceptKey: text(raw.conceptKey ?? raw.key, 160),
    title: text(raw.title ?? raw.heading, 500),
    content: exactContent(raw.content ?? raw.originalContent ?? raw.body),
    excerptContent: exactContent(raw.excerptContent ?? raw.allowedExcerpt),
    subject: text(raw.subject ?? parent.subject, 120),
    targetGrades: list(raw.targetGrades ?? raw.grades ?? parent.targetGrades, 20),
    questionTypes: list(raw.questionTypes ?? parent.questionTypes, 40).map((item) => item.toUpperCase()),
    sourceType,
    sourceTitle: sourceTitle || fallbackId,
    publicationYear,
    edition: text(raw.edition ?? raw.source?.edition ?? parent.edition, 120) || undefined,
    curriculumVersion: text(
      raw.curriculumVersion ?? raw.source?.curriculumVersion ?? parent.curriculumVersion,
      120,
    ) || undefined,
    unit: text(raw.unit ?? raw.source?.unit ?? parent.unit, 240) || undefined,
    chapter: text(raw.chapter ?? raw.source?.chapter ?? parent.chapter, 240) || undefined,
    section: text(raw.section ?? raw.source?.section ?? parent.section, 240) || undefined,
    page: Number(raw.page ?? raw.source?.page ?? parent.page) || undefined,
    sequence: Number.isFinite(Number(raw.sequence)) ? Number(raw.sequence) : undefined,
    updatedAt: raw.updatedAt ?? parent.updatedAt,
    rightsStatus: text(raw.rightsStatus ?? parent.rightsStatus, 120),
    allowedUse: normalizeAllowedUse(raw.allowedUse ?? parent.allowedUse),
    sourceAccessPolicy: text(raw.sourceAccessPolicy ?? parent.sourceAccessPolicy, 160),
    copyrightPolicy: text(raw.copyrightPolicy ?? parent.copyrightPolicy, 200),
    active: raw.active !== false && parent.active !== false,
    origin: text(parent.origin, 80) || DIRECT_COLLECTION,
  };
}

function embeddedBlocks(data) {
  if (Array.isArray(data.conceptBlocks)) return data.conceptBlocks;
  if (Array.isArray(data.conceptRecords)) return data.conceptRecords;
  if (Array.isArray(data.concepts)) return data.concepts;
  if (Array.isArray(data.conceptSection?.blocks)) return data.conceptSection.blocks;
  return [];
}

function parentMetadata(data, origin) {
  return {
    origin,
    title: data.title,
    subject: data.subject,
    sourceTitle: data.sourceTitle ?? data.title ?? data.subject,
    sourceType: data.sourceType,
    publicationYear: data.publicationYear,
    edition: data.edition,
    curriculumVersion: data.curriculumVersion,
    unit: data.unit,
    chapter: data.chapter,
    section: data.section,
    targetGrades: data.targetGrades,
    questionTypes: data.questionTypes,
    rightsStatus: data.rightsStatus,
    allowedUse: data.allowedUse,
    sourceAccessPolicy: data.sourceAccessPolicy,
    copyrightPolicy: data.copyrightPolicy,
    updatedAt: data.updatedAt,
    active: data.active,
  };
}

async function readDirectRecords(firestore, conceptKeys) {
  const documents = new Map();
  for (let offset = 0; offset < conceptKeys.length; offset += DIRECT_QUERY_BATCH_SIZE) {
    const batch = conceptKeys.slice(offset, offset + DIRECT_QUERY_BATCH_SIZE);
    if (!batch.length) continue;
    const snapshot = await firestore.collection(DIRECT_COLLECTION).where("conceptKey", "in", batch).get();
    snapshot.docs.forEach((doc) => documents.set(doc.id, doc));
  }
  if (documents.size === 0) {
    const fallback = await firestore.collection(DIRECT_COLLECTION).limit(600).get();
    fallback.docs.forEach((doc) => documents.set(doc.id, doc));
  }
  return [...documents.values()].map((doc, index) => normalizeRecord(
    doc.data() || {},
    doc.id,
    index,
    { origin: DIRECT_COLLECTION },
  ));
}

async function readEmbeddedRecords(firestore, collectionName, limit) {
  const snapshot = await firestore.collection(collectionName).limit(limit).get();
  const records = [];
  for (const doc of snapshot.docs) {
    const data = doc.data() || {};
    const parent = parentMetadata(data, collectionName);
    embeddedBlocks(data).forEach((block, index) => {
      records.push(normalizeRecord(block || {}, doc.id, index, parent));
    });
  }
  return records;
}

function matchesSubject(record, requestedSubject) {
  const requested = text(requestedSubject, 120).toLowerCase();
  if (!requested || !record.subject) return true;
  const subject = record.subject.toLowerCase();
  if (requested === "english") return /english|영어/.test(subject);
  return subject.includes(requested) || requested.includes(subject);
}

function matchesRequest(record, params) {
  if (!record.active || !record.conceptKey || !record.content) return false;
  if (!params.conceptKeys.includes(record.conceptKey)) return false;
  if (!matchesSubject(record, params.subject)) return false;
  if (
    record.questionTypes.length
    && !record.questionTypes.some((type) => params.questionTypes.includes(type))
  ) return false;
  if (
    record.targetGrades.length
    && params.targetGrade
    && !record.targetGrades.some((grade) => params.targetGrade.includes(grade) || grade.includes(params.targetGrade))
  ) return false;
  return true;
}

export function allowedConceptContent(record, { isSuperAdmin = false } = {}) {
  const policy = `${record.copyrightPolicy} ${record.sourceAccessPolicy}`.toLowerCase();
  if (/no[_ -]?source[_ -]?republication|reference[_ -]?only|system[_ -]?reference[_ -]?only/.test(policy)) {
    return null;
  }
  if (/master[_ -]?only/.test(record.sourceAccessPolicy) && !isSuperAdmin) return null;
  if (record.allowedUse === "reference_only") return null;
  if (record.allowedUse === "excerpt") {
    return record.excerptContent ? { content: record.excerptContent, allowedUse: "excerpt" } : null;
  }
  if (record.allowedUse === "verbatim") return { content: record.content, allowedUse: "verbatim" };

  // Legacy INTERNAL records remain opt-in; add allowedUse as their metadata is curated.
  const cleared = /approved|cleared|licensed|owned|public[_ -]?domain/i.test(record.rightsStatus);
  if (record.sourceType === "INTERNAL" && cleared) {
    return { content: record.content, allowedUse: "verbatim" };
  }
  return null;
}

export class FirestoreConceptRepository {
  constructor(firestore) {
    this.firestore = firestore;
  }

  async search(params) {
    const conceptKeys = [...new Set((params.conceptKeys || []).map((item) => text(item, 160)).filter(Boolean))];
    if (!conceptKeys.length) return [];
    const settled = await Promise.allSettled([
      readDirectRecords(this.firestore, conceptKeys),
      readEmbeddedRecords(this.firestore, "english_reference_profiles", 250),
      readEmbeddedRecords(this.firestore, "contents", 600),
    ]);
    const records = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    return records.filter((record) => matchesRequest(record, {
      ...params,
      conceptKeys,
      questionTypes: (params.questionTypes || []).map((item) => text(item, 100).toUpperCase()),
    }));
  }
}
