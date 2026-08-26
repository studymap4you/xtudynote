import { createHmac } from "node:crypto";
import admin from "firebase-admin";

const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;
const MAX_MEMBER_ROWS = 2_000;

function cleanText(value, maxLength = 300) {
  return String(value ?? "").replace(/\u0000/gu, "").trim().slice(0, maxLength);
}

function iso(value) {
  const date = typeof value?.toDate === "function" ? value.toDate() : value instanceof Date ? value : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

function kstDayKey(now = new Date()) {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function visitorHash({ config, visitorId, ip, userAgent }) {
  const secret = config.trialHashSecret || config.cronSecret || "xtudy-anonymous-visitor-v1";
  const stableInput = cleanText(visitorId, 180) || `${cleanText(ip, 120)}:${cleanText(userAgent, 400)}`;
  return createHmac("sha256", secret).update(stableInput).digest("hex");
}

export async function recordSiteVisit({
  db,
  config,
  visitorId,
  ip,
  userAgent,
  path,
  user = null,
  now = new Date(),
}) {
  const day = kstDayKey(now);
  const hash = visitorHash({ config, visitorId, ip, userAgent });
  const pagePath = cleanText(path, 240) || "/";
  const summaryRef = db.doc("site_metrics/summary");
  const visitorRef = db.doc(`site_visitors/${hash}`);
  const dayRef = db.doc(`site_visit_days/${day}`);
  const dayVisitorRef = db.doc(`site_visit_days/${day}/visitors/${hash}`);
  const authenticatedDayRef = user?.uid
    ? db.doc(`site_visit_days/${day}/authenticated_users/${user.uid}`)
    : null;
  const increment = admin.firestore.FieldValue.increment;

  await db.runTransaction(async (transaction) => {
    const reads = [transaction.get(visitorRef), transaction.get(dayVisitorRef)];
    if (authenticatedDayRef) reads.push(transaction.get(authenticatedDayRef));
    const [visitorSnapshot, dayVisitorSnapshot, authenticatedDaySnapshot] = await Promise.all(reads);

    transaction.set(summaryRef, {
      totalPageViews: increment(1),
      totalUniqueVisitors: increment(visitorSnapshot.exists ? 0 : 1),
      authenticatedPageViews: increment(user?.uid ? 1 : 0),
      updatedAt: now,
    }, { merge: true });
    transaction.set(dayRef, {
      day,
      pageViews: increment(1),
      uniqueVisitors: increment(dayVisitorSnapshot.exists ? 0 : 1),
      authenticatedPageViews: increment(user?.uid ? 1 : 0),
      authenticatedVisitors: increment(authenticatedDayRef && !authenticatedDaySnapshot?.exists ? 1 : 0),
      updatedAt: now,
    }, { merge: true });
    transaction.set(visitorRef, {
      visitorHash: hash,
      firstSeenAt: visitorSnapshot.exists ? visitorSnapshot.data()?.firstSeenAt || now : now,
      lastSeenAt: now,
      lastPath: pagePath,
      lastAuthenticatedUid: user?.uid || visitorSnapshot.data()?.lastAuthenticatedUid || null,
    }, { merge: true });
    transaction.set(dayVisitorRef, {
      visitorHash: hash,
      firstSeenAt: dayVisitorSnapshot.exists ? dayVisitorSnapshot.data()?.firstSeenAt || now : now,
      lastSeenAt: now,
      lastPath: pagePath,
    }, { merge: true });
    if (authenticatedDayRef) {
      transaction.set(authenticatedDayRef, {
        uid: user.uid,
        email: cleanText(user.email, 200),
        firstSeenAt: authenticatedDaySnapshot?.exists ? authenticatedDaySnapshot.data()?.firstSeenAt || now : now,
        lastSeenAt: now,
      }, { merge: true });
    }
  });
}

function memberRow(snapshot) {
  const data = snapshot.data() || {};
  return {
    uid: snapshot.id,
    email: cleanText(data.email, 200),
    displayName: cleanText(data.displayName, 120),
    role: cleanText(data.role || "student", 40),
    accountStatus: cleanText(data.accountStatus || "active", 40),
    createdAt: iso(data.createdAt),
  };
}

export async function getSiteOperationsOverview({ db, now = new Date() }) {
  const today = kstDayKey(now);
  const [summarySnapshot, todaySnapshot, daySnapshot, userSnapshot] = await Promise.all([
    db.doc("site_metrics/summary").get(),
    db.doc(`site_visit_days/${today}`).get(),
    db.collection("site_visit_days")
      .orderBy(admin.firestore.FieldPath.documentId(), "desc")
      .limit(7)
      .get(),
    db.collection("users").limit(MAX_MEMBER_ROWS).get(),
  ]);
  const summary = summarySnapshot.data() || {};
  const todayData = todaySnapshot.data() || {};
  const members = userSnapshot.docs
    .map(memberRow)
    .sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""));
  const roleCounts = { super_admin: 0, teacher: 0, pending_teacher: 0, student: 0 };
  let active = 0;
  let banned = 0;
  for (const member of members) {
    if (member.accountStatus === "banned") banned += 1;
    else active += 1;
    if (member.role in roleCounts) roleCounts[member.role] += 1;
  }
  return {
    visitors: {
      today,
      todayPageViews: Number(todayData.pageViews) || 0,
      todayUniqueVisitors: Number(todayData.uniqueVisitors) || 0,
      todayAuthenticatedVisitors: Number(todayData.authenticatedVisitors) || 0,
      totalPageViews: Number(summary.totalPageViews) || 0,
      totalUniqueVisitors: Number(summary.totalUniqueVisitors) || 0,
      updatedAt: iso(summary.updatedAt),
      daily: daySnapshot.docs.map((snapshot) => {
        const data = snapshot.data() || {};
        return {
          day: snapshot.id,
          pageViews: Number(data.pageViews) || 0,
          uniqueVisitors: Number(data.uniqueVisitors) || 0,
          authenticatedVisitors: Number(data.authenticatedVisitors) || 0,
        };
      }),
    },
    members: {
      total: members.length,
      active,
      banned,
      roleCounts,
      rows: members,
      truncated: userSnapshot.size >= MAX_MEMBER_ROWS,
    },
  };
}
