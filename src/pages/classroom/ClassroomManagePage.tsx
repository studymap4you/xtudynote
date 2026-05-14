import { FirebaseError } from "firebase/app";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  deleteField,
} from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { TeacherRoute } from "@/components/TeacherRoute";
import { DashboardShell } from "@/components/DashboardShell";
import { RichHtmlView } from "@/components/RichHtmlView";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ClassroomQaBoard } from "@/components/classroom/ClassroomQaBoard";
import { ClassroomSectionModal } from "@/components/classroom/ClassroomSectionModal";
import { db, storage } from "@/firebase/config";
import { deleteClassroomCascade } from "@/lib/classroom/deleteClassroomCascade";
import { syncClassroomPublicListing } from "@/lib/classroom/classroomPublicListing";
import { getClassroomIntroBody } from "@/lib/classroomDisplay";
import { parseTuitionKrwInput } from "@/lib/formatTuitionKrw";
import { isHttpUrl, normalizeExternalUrl } from "@/lib/isHttpUrl";
import type {
  ClassroomDocument,
  ClassroomEnrollmentRequestDocument,
  ClassroomMemberEnrollmentDocument,
  ClassroomNoticeDocument,
} from "@/types/classroom";
import type {
  ClassroomLessonDocument,
  LessonMaterialItem,
  LessonVideoItem,
} from "@/types/classroomLesson";
import {
  collectLessonStoragePaths,
  effectiveLessonMaterialItems,
  effectiveLessonVideoItems,
  newLessonMediaId,
  serializeMaterialItemsForFirestore,
  serializeVideoItemsForFirestore,
  uploadLessonMediaFile,
} from "@/lib/classroom/lessonMedia";
import type { MaterialRequestDocument } from "@/types/materialRequest";
import type { VideoMaterialRequestDocument } from "@/types/videoMaterialRequest";
import { collectVideoUrlsFromRequest } from "@/lib/videoMaterialUrls";
import { ensureTeacherRosterForStudent, listWorksheetRoster, syncTeacherRosterForClassroomMemberDelta } from "@/lib/worksheet/teacherRosterApi";
import "@/pages/pages.css";

type TabId = "intro" | "notices" | "materials" | "video" | "qa" | "members";

const LESSON_VIDEO_BYTES_MAX = 100 * 1024 * 1024;
const LESSON_MATERIAL_BYTES_MAX = 50 * 1024 * 1024;

function tsLabel(t: unknown): string {
  if (t && typeof t === "object" && "toMillis" in t && typeof (t as { toMillis: () => number }).toMillis === "function") {
    return new Date((t as { toMillis: () => number }).toMillis()).toLocaleString();
  }
  return "";
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { firebaseUser } = useAuth();
  const [room, setRoom] = useState<(ClassroomDocument & { id: string }) | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState<TabId | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [savingIntro, setSavingIntro] = useState(false);
  const [introErr, setIntroErr] = useState<string | null>(null);
  const [introSaveOk, setIntroSaveOk] = useState<string | null>(null);
  const introFeedbackRef = useRef<HTMLDivElement>(null);

  const [materialRows, setMaterialRows] = useState<{ id: string; data: MaterialRequestDocument }[]>([]);
  const [videoRows, setVideoRows] = useState<{ id: string; data: VideoMaterialRequestDocument }[]>([]);
  const [listsLoading, setListsLoading] = useState(false);

  const [bulkMemberText, setBulkMemberText] = useState("");
  const [newMemberUid, setNewMemberUid] = useState("");
  const [savingMembers, setSavingMembers] = useState(false);
  const [membersErr, setMembersErr] = useState<string | null>(null);
  const [memberRosterHint, setMemberRosterHint] = useState<
    Record<string, { displayName?: string; emailLower?: string }>
  >({});

  const [pricingType, setPricingType] = useState<"free" | "paid">("free");
  const [tuitionFeeInput, setTuitionFeeInput] = useState("");

  const [memberEnrollmentById, setMemberEnrollmentById] = useState<
    Record<string, ClassroomMemberEnrollmentDocument>
  >({});

  const [paidEnrollmentRows, setPaidEnrollmentRows] = useState<
    { id: string; data: ClassroomEnrollmentRequestDocument }[]
  >([]);
  const [paidEnrollmentBusyId, setPaidEnrollmentBusyId] = useState<string | null>(null);

  const [noticeRows, setNoticeRows] = useState<{ id: string; data: ClassroomNoticeDocument }[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(true);
  const [newNoticeBody, setNewNoticeBody] = useState("");
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [noticeErr, setNoticeErr] = useState<string | null>(null);
  const [deleteClassroomBusy, setDeleteClassroomBusy] = useState(false);
  const [deleteClassroomErr, setDeleteClassroomErr] = useState<string | null>(null);

  const [lessonRows, setLessonRows] = useState<{ id: string; data: ClassroomLessonDocument }[]>([]);
  const [lessonErr, setLessonErr] = useState<string | null>(null);
  const [lessonBusy, setLessonBusy] = useState(false);
  const [newUnit, setNewUnit] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSummary, setNewSummary] = useState("");
  const newLessonDraftSegmentRef = useRef(`_draft_${newLessonMediaId()}`);
  const [pendingNewVideos, setPendingNewVideos] = useState<LessonVideoItem[]>([]);
  const [pendingNewMaterials, setPendingNewMaterials] = useState<LessonMaterialItem[]>([]);
  const [newVideoUrlDraft, setNewVideoUrlDraft] = useState("");
  const [newMaterialCidDraft, setNewMaterialCidDraft] = useState("");
  const [newMaterialUrlDraft, setNewMaterialUrlDraft] = useState("");
  const [lessonMediaBusy, setLessonMediaBusy] = useState(false);
  const [videoUrlDraftByLesson, setVideoUrlDraftByLesson] = useState<Record<string, string>>({});
  const [matCidDraftByLesson, setMatCidDraftByLesson] = useState<Record<string, string>>({});
  const [matUrlDraftByLesson, setMatUrlDraftByLesson] = useState<Record<string, string>>({});

  const [studentChatUrlDraft, setStudentChatUrlDraft] = useState("");
  const [tuitionPaymentUrlDraft, setTuitionPaymentUrlDraft] = useState("");
  const [studentChatBusy, setStudentChatBusy] = useState(false);
  const [studentChatErr, setStudentChatErr] = useState<string | null>(null);
  const [studentChatOk, setStudentChatOk] = useState<string | null>(null);
  const [landingThumbBusy, setLandingThumbBusy] = useState(false);
  const [landingThumbErr, setLandingThumbErr] = useState<string | null>(null);
  const [landingThumbLocalPreview, setLandingThumbLocalPreview] = useState<string | null>(null);
  const landingThumbPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    if (!id || !firebaseUser) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const s = await getDoc(doc(db, "classrooms", id));
        if (!s.exists()) {
          if (!cancelled) setRoom(null);
          return;
        }
        const d = s.data() as ClassroomDocument;
        if (d.teacherId !== firebaseUser.uid) {
          if (!cancelled) setForbidden(true);
          return;
        }
        if (!cancelled) {
          setRoom({ id: s.id, ...d });
          setTitle(d.title);
          setDescription(d.description ?? "");
          setIntroduction(d.introduction ?? "");
          setPricingType(d.pricingType === "paid" ? "paid" : "free");
          const fee = d.tuitionFeeKrw;
          setTuitionFeeInput(
            typeof fee === "number" && Number.isFinite(fee) && fee > 0 ? String(Math.round(fee)) : "",
          );
          setStudentChatUrlDraft(normalizeExternalUrl(d.studentChatUrl));
          setTuitionPaymentUrlDraft(normalizeExternalUrl(d.tuitionPaymentUrl));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, firebaseUser]);

  useEffect(() => {
    if (!id || !room || !firebaseUser || room.teacherId !== firebaseUser.uid) return;
    void syncClassroomPublicListing(db, id, {
      title: room.title,
      description: room.description ?? "",
      pricingType: room.pricingType === "paid" ? "paid" : "free",
      tuitionFeeKrw: room.tuitionFeeKrw,
    }).catch(() => {});
  }, [id, firebaseUser, room?.teacherId, room?.title, room?.description, room?.pricingType, room?.tuitionFeeKrw]);

  useEffect(() => {
    if (!id || room?.pricingType !== "paid") {
      setPaidEnrollmentRows([]);
      return;
    }
    const col = collection(db, "classrooms", id, "enrollment_requests");
    const unsub = onSnapshot(
      col,
      (snap) => {
        const list: { id: string; data: ClassroomEnrollmentRequestDocument }[] = [];
        snap.forEach((d) => list.push({ id: d.id, data: d.data() as ClassroomEnrollmentRequestDocument }));
        list.sort((a, b) => {
          const ta = a.data.requestedAt as { toMillis?: () => number } | undefined;
          const tb = b.data.requestedAt as { toMillis?: () => number } | undefined;
          return (tb?.toMillis?.() ?? 0) - (ta?.toMillis?.() ?? 0);
        });
        setPaidEnrollmentRows(list);
      },
      () => setPaidEnrollmentRows([]),
    );
    return () => unsub();
  }, [id, room?.pricingType]);

  const studentChatFocusIntent = searchParams.get("focus") === "studentChat";

  useEffect(() => {
    return () => {
      if (landingThumbPreviewRef.current) {
        URL.revokeObjectURL(landingThumbPreviewRef.current);
        landingThumbPreviewRef.current = null;
      }
    };
  }, []);

  function setLandingThumbPreviewUrl(next: string | null) {
    if (landingThumbPreviewRef.current) {
      URL.revokeObjectURL(landingThumbPreviewRef.current);
      landingThumbPreviewRef.current = null;
    }
    if (next) landingThumbPreviewRef.current = next;
    setLandingThumbLocalPreview(next);
  }

  useEffect(() => {
    if (!room || !studentChatFocusIntent) return;
    setOpenModal("intro");
    const tid = window.setTimeout(() => {
      document.getElementById("hub-student-chat")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 250);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("focus");
        return next;
      },
      { replace: true },
    );
    return () => window.clearTimeout(tid);
  }, [room, studentChatFocusIntent, setSearchParams]);

  useEffect(() => {
    if (room) setBulkMemberText((room.memberStudentIds ?? []).join("\n"));
  }, [room]);

  useEffect(() => {
    if (!firebaseUser?.uid || openModal !== "members") return;
    let cancelled = false;
    void listWorksheetRoster(firebaseUser.uid).then((rows) => {
      if (cancelled) return;
      const m: Record<string, { displayName?: string; emailLower?: string }> = {};
      for (const r of rows) {
        m[r.id] = {
          displayName: r.data.displayName,
          emailLower: r.data.emailLower,
        };
      }
      setMemberRosterHint(m);
    });
    return () => {
      cancelled = true;
    };
  }, [firebaseUser?.uid, openModal, room?.memberStudentIds]);

  useEffect(() => {
    if (!id || openModal !== "members" || !room) {
      setMemberEnrollmentById({});
      return;
    }
    const col = collection(db, "classrooms", id, "member_enrollments");
    const unsub = onSnapshot(
      col,
      (snap) => {
        const m: Record<string, ClassroomMemberEnrollmentDocument> = {};
        snap.forEach((docSnap) => {
          m[docSnap.id] = docSnap.data() as ClassroomMemberEnrollmentDocument;
        });
        setMemberEnrollmentById(m);
      },
      () => setMemberEnrollmentById({}),
    );
    return () => unsub();
  }, [id, openModal, room]);

  useEffect(() => {
    if (!id || !room) {
      setLessonRows([]);
      return;
    }
    setLessonErr(null);
    const lq = query(collection(db, "classrooms", id, "lessons"), orderBy("orderIndex", "asc"));
    const unsub = onSnapshot(
      lq,
      (snap) => {
        const list: { id: string; data: ClassroomLessonDocument }[] = [];
        snap.forEach((d) => list.push({ id: d.id, data: d.data() as ClassroomLessonDocument }));
        setLessonRows(list);
      },
      (e) => {
        setLessonRows([]);
        setLessonErr(e.message || "레슨 목록을 불러오지 못했습니다.");
      },
    );
    return () => unsub();
  }, [id, room]);

  useEffect(() => {
    if (!id || !room) return;
    setNoticesLoading(true);
    setNoticeErr(null);
    const nq = query(collection(db, "classrooms", id, "notices"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      nq,
      (snap) => {
        const rowsN: { id: string; data: ClassroomNoticeDocument }[] = [];
        snap.forEach((d) => rowsN.push({ id: d.id, data: d.data() as ClassroomNoticeDocument }));
        setNoticeRows(rowsN);
        setNoticesLoading(false);
      },
      (e) => {
        setNoticeErr(e.message || "공지를 불러오지 못했습니다.");
        setNoticesLoading(false);
      },
    );
    return () => unsub();
  }, [id, room]);

  useEffect(() => {
    if (!id || !room) return;
    let cancelled = false;
    (async () => {
      setListsLoading(true);
      try {
        const mq = query(collection(db, "material_requests"), where("classroomId", "==", id));
        const vq = query(collection(db, "video_material_requests"), where("classroomId", "==", id));
        const [ms, vs] = await Promise.all([getDocs(mq), getDocs(vq)]);
        if (cancelled) return;
        const mat: { id: string; data: MaterialRequestDocument }[] = [];
        const vid: { id: string; data: VideoMaterialRequestDocument }[] = [];
        ms.forEach((d) => mat.push({ id: d.id, data: d.data() as MaterialRequestDocument }));
        vs.forEach((d) => vid.push({ id: d.id, data: d.data() as VideoMaterialRequestDocument }));
        mat.sort((a, b) => {
          const ta = a.data.createdAt as { toMillis?: () => number } | undefined;
          const tb = b.data.createdAt as { toMillis?: () => number } | undefined;
          return (tb?.toMillis?.() ?? 0) - (ta?.toMillis?.() ?? 0);
        });
        vid.sort((a, b) => {
          const ta = a.data.createdAt as { toMillis?: () => number } | undefined;
          const tb = b.data.createdAt as { toMillis?: () => number } | undefined;
          return (tb?.toMillis?.() ?? 0) - (ta?.toMillis?.() ?? 0);
        });
        setMaterialRows(mat);
        setVideoRows(vid);
      } finally {
        if (!cancelled) setListsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, room]);

  useEffect(() => {
    if (!introSaveOk) return;
    const t = window.setTimeout(() => setIntroSaveOk(null), 6000);
    return () => window.clearTimeout(t);
  }, [introSaveOk]);

  useEffect(() => {
    if (!studentChatOk) return;
    const t = window.setTimeout(() => setStudentChatOk(null), 6000);
    return () => window.clearTimeout(t);
  }, [studentChatOk]);

  useEffect(() => {
    if (!introErr && !introSaveOk) return;
    introFeedbackRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [introErr, introSaveOk]);

  const q = (path: string) => `${path}?classroomId=${encodeURIComponent(id ?? "")}`;

  async function saveBulkMembers(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !room || !firebaseUser) return;
    const raw = bulkMemberText
      .split(/[\s,;]+/g)
      .map((s) => s.trim())
      .filter(Boolean);
    const uniq = [...new Set(raw)].slice(0, 120);
    const prev = room.memberStudentIds ?? [];
    const prevSet = new Set(prev.map(String));
    const added = uniq.filter((u) => !prevSet.has(u));
    const removed = prev.filter((u) => !uniq.includes(u)).map(String);
    const invalidShort = uniq.filter((u) => u.length < 8);
    if (invalidShort.length > 0) {
      setMembersErr("UID는 8자 이상 문자열로 입력되어야 합니다. 잘못된 줄을 확인해 주세요.");
      return;
    }
    setSavingMembers(true);
    setMembersErr(null);
    try {
      const batch = writeBatch(db);
      const cRef = doc(db, "classrooms", id);
      batch.update(cRef, { memberStudentIds: uniq });
      for (const rid of removed) {
        batch.delete(doc(db, "classrooms", id, "member_enrollments", rid));
      }
      await batch.commit();
      setRoom({ ...room, memberStudentIds: uniq });
      await syncTeacherRosterForClassroomMemberDelta(firebaseUser.uid, { added, removed });
    } catch (err) {
      setMembersErr(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setSavingMembers(false);
    }
  }

  async function addSingleMember(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !room || !firebaseUser) return;
    const uid = newMemberUid.trim();
    if (uid.length < 8) {
      setMembersErr("UID는 최소 8자 이상이어야 합니다.");
      return;
    }
    const prev = room.memberStudentIds ?? [];
    if (prev.some((x) => String(x).trim() === uid)) {
      setMembersErr("이미 목록에 있는 UID입니다.");
      return;
    }
    if (prev.length >= 120) {
      setMembersErr("최대 120명까지 등록할 수 있습니다.");
      return;
    }
    setSavingMembers(true);
    setMembersErr(null);
    try {
      const next = [...prev.map(String), uid];
      await updateDoc(doc(db, "classrooms", id), { memberStudentIds: next });
      setRoom({ ...room, memberStudentIds: next });
      await syncTeacherRosterForClassroomMemberDelta(firebaseUser.uid, { added: [uid], removed: [] });
      setNewMemberUid("");
      await listWorksheetRoster(firebaseUser.uid).then((rows) => {
        const m: Record<string, { displayName?: string; emailLower?: string }> = {};
        for (const r of rows) {
          m[r.id] = {
            displayName: r.data.displayName,
            emailLower: r.data.emailLower,
          };
        }
        setMemberRosterHint(m);
      });
    } catch (err) {
      setMembersErr(err instanceof Error ? err.message : "추가에 실패했습니다.");
    } finally {
      setSavingMembers(false);
    }
  }

  async function removeSingleMember(studentUid: string) {
    if (!id || !room || !firebaseUser) return;
    const uid = studentUid.trim();
    const prev = room.memberStudentIds ?? [];
    const next = prev.map(String).filter((x) => x !== uid);
    setSavingMembers(true);
    setMembersErr(null);
    try {
      const batch = writeBatch(db);
      const cRef = doc(db, "classrooms", id);
      batch.update(cRef, { memberStudentIds: next });
      batch.delete(doc(db, "classrooms", id, "member_enrollments", uid));
      await batch.commit();
      setRoom({ ...room, memberStudentIds: next });
      await syncTeacherRosterForClassroomMemberDelta(firebaseUser.uid, { added: [], removed: [uid] });
      await listWorksheetRoster(firebaseUser.uid).then((rows) => {
        const m: Record<string, { displayName?: string; emailLower?: string }> = {};
        for (const r of rows) {
          m[r.id] = {
            displayName: r.data.displayName,
            emailLower: r.data.emailLower,
          };
        }
        setMemberRosterHint(m);
      });
    } catch (err) {
      setMembersErr(err instanceof Error ? err.message : "제거에 실패했습니다.");
    } finally {
      setSavingMembers(false);
    }
  }

  async function approvePaidEnrollment(studentUid: string) {
    if (!id || !room || !firebaseUser || room.teacherId !== firebaseUser.uid) return;
    const suid = studentUid.trim();
    if (paidEnrollmentBusyId) return;
    setPaidEnrollmentBusyId(suid);
    setMembersErr(null);
    try {
      const reqRef = doc(db, "classrooms", id, "enrollment_requests", suid);
      const reqSs = await getDoc(reqRef);
      if (!reqSs.exists()) {
        setMembersErr("이미 처리되었거나 신청을 찾을 수 없습니다.");
        return;
      }
      const reqData = reqSs.data() as ClassroomEnrollmentRequestDocument;
      const enPayload: ClassroomMemberEnrollmentDocument = {
        studentId: suid,
        email: reqData.email,
        phone: reqData.phone,
        classroomId: id,
        teacherId: room.teacherId,
        classroomTitle: reqData.classroomTitle,
        enrolledAt: serverTimestamp(),
      };
      const batch = writeBatch(db);
      batch.delete(reqRef);
      batch.set(doc(db, "classrooms", id, "member_enrollments", suid), enPayload);
      const prev = room.memberStudentIds ?? [];
      const prevStr = prev.map(String);
      if (!prevStr.includes(suid)) {
        batch.update(doc(db, "classrooms", id), { memberStudentIds: [...prevStr, suid] });
      }
      await batch.commit();
      setRoom((prevRoom) => {
        if (!prevRoom) return prevRoom;
        const ids = prevRoom.memberStudentIds ?? [];
        if (ids.map(String).includes(suid)) return prevRoom;
        return { ...prevRoom, memberStudentIds: [...ids.map(String), suid] };
      });
      try {
        await ensureTeacherRosterForStudent(room.teacherId, suid, { classroomId: id });
      } catch {
        /* 멤버 등록은 완료 */
      }
    } catch (err) {
      setMembersErr(err instanceof Error ? err.message : "승인하지 못했습니다.");
    } finally {
      setPaidEnrollmentBusyId(null);
    }
  }

  async function rejectPaidEnrollment(studentUid: string) {
    if (!id || !firebaseUser || room?.teacherId !== firebaseUser.uid) return;
    const suid = studentUid.trim();
    if (paidEnrollmentBusyId) return;
    if (!window.confirm(`「${suid}」학생의 유료 수강 신청을 거절하고 대기 목록에서 제거할까요?`)) return;
    setPaidEnrollmentBusyId(suid);
    setMembersErr(null);
    try {
      await deleteDoc(doc(db, "classrooms", id, "enrollment_requests", suid));
    } catch (err) {
      setMembersErr(err instanceof Error ? err.message : "거절 처리에 실패했습니다.");
    } finally {
      setPaidEnrollmentBusyId(null);
    }
  }

  function introSaveErrorMessage(err: unknown): string {
    if (err instanceof FirebaseError && err.code === "permission-denied") {
      return "저장 권한이 없습니다. 계정 역할·강의실 소유를 확인해 주세요.";
    }
    return err instanceof Error ? err.message : "저장에 실패했습니다.";
  }

  async function addNotice(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !room) return;
    const b = newNoticeBody.trim();
    if (!b) return;
    setNoticeBusy(true);
    setNoticeErr(null);
    try {
      await addDoc(collection(db, "classrooms", id, "notices"), {
        body: b.slice(0, 8000),
        createdAt: serverTimestamp(),
      });
      setNewNoticeBody("");
    } catch (err) {
      setNoticeErr(err instanceof Error ? err.message : "등록에 실패했습니다.");
    } finally {
      setNoticeBusy(false);
    }
  }

  async function removeNotice(noticeId: string) {
    if (!id) return;
    setNoticeBusy(true);
    setNoticeErr(null);
    try {
      await deleteDoc(doc(db, "classrooms", id, "notices", noticeId));
    } catch (err) {
      setNoticeErr(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setNoticeBusy(false);
    }
  }

  async function deleteClassroomAsTeacher() {
    if (!id || !room) return;
    const n = room.memberStudentIds?.length ?? 0;
    if (n > 0) return;
    const ok =
      typeof window !== "undefined"
        ? window.confirm(
            "이 강의실과 글감 데이터(질문·공지 등)가 모두 삭제됩니다. 정말 삭제할까요?",
          )
        : false;
    if (!ok) return;
    setDeleteClassroomBusy(true);
    setDeleteClassroomErr(null);
    try {
      await deleteClassroomCascade(db, id);
      navigate("/classroom");
    } catch (err) {
      setDeleteClassroomErr(
        err instanceof Error ? err.message : "삭제하지 못했습니다. 멤버가 남았는지·권한을 확인해 주세요.",
      );
    } finally {
      setDeleteClassroomBusy(false);
    }
  }

  async function uploadLandingPromoThumbnail(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id || !firebaseUser || !room) return;
    setLandingThumbErr(null);
    if (!file.type.startsWith("image/")) {
      setLandingThumbErr("이미지 파일만 올려 주세요.");
      e.target.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLandingThumbErr("파일 크기는 2MB 이하여야 합니다.");
      e.target.value = "";
      return;
    }
    setLandingThumbPreviewUrl(URL.createObjectURL(file));
    setLandingThumbBusy(true);
    try {
      const safe = `${Date.now()}_${file.name.replace(/[^\w.-]/g, "_")}`;
      const sref = ref(storage, `classroom_landing_promo/${id}/${safe}`);
      await uploadBytes(sref, file);
      const url = await getDownloadURL(sref);
      await updateDoc(doc(db, "classrooms", id), { landingPromoThumbnailUrl: url });
      setRoom((prev) => (prev ? { ...prev, landingPromoThumbnailUrl: url } : prev));
      setLandingThumbPreviewUrl(null);
    } catch (err) {
      setLandingThumbErr(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setLandingThumbBusy(false);
      e.target.value = "";
    }
  }

  async function removeLandingPromoThumbnail() {
    if (!id || !room?.landingPromoThumbnailUrl) return;
    if (!window.confirm("홈 화면 강의 카드에서 이 강의가 사라집니다. 썸네일을 제거할까요?")) return;
    setLandingThumbErr(null);
    setLandingThumbPreviewUrl(null);
    setLandingThumbBusy(true);
    try {
      await updateDoc(doc(db, "classrooms", id), { landingPromoThumbnailUrl: deleteField() });
      setRoom((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        delete next.landingPromoThumbnailUrl;
        return next;
      });
    } catch (err) {
      setLandingThumbErr(err instanceof Error ? err.message : "제거에 실패했습니다.");
    } finally {
      setLandingThumbBusy(false);
    }
  }

  async function saveIntro(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !firebaseUser || !room) return;
    const t = title.trim();
    if (!t) {
      setIntroSaveOk(null);
      setIntroErr("강의실 이름을 입력해 주세요.");
      return;
    }
    setSavingIntro(true);
    setIntroErr(null);
    setIntroSaveOk(null);
    let tuitionFeeKrw: number | null = null;
    if (pricingType === "paid") {
      tuitionFeeKrw = parseTuitionKrwInput(tuitionFeeInput);
      if (tuitionFeeKrw == null) {
        setSavingIntro(false);
        setIntroErr(
          "유료 강의실은 수강가격(원)을 1원 이상 99,999,999원 이하로 입력해 주세요. 숫자만 입력하면 됩니다.",
        );
        return;
      }
    }
    try {
      const payPatch: Record<string, unknown> = {};
      if (pricingType === "paid") {
        const raw = normalizeExternalUrl(tuitionPaymentUrlDraft);
        if (raw && isHttpUrl(raw)) {
          payPatch.tuitionPaymentUrl = raw.slice(0, 2048);
        } else {
          payPatch.tuitionPaymentUrl = deleteField();
        }
      } else {
        payPatch.tuitionPaymentUrl = deleteField();
      }
      await updateDoc(doc(db, "classrooms", id), {
        title: t,
        description: description.trim(),
        introduction: introduction.trim(),
        pricingType,
        ...(pricingType === "paid" ? { tuitionFeeKrw } : { tuitionFeeKrw: deleteField() }),
        ...payPatch,
      });
      setRoom((prev) => {
        if (!prev) return prev;
        const next: ClassroomDocument & { id: string } = {
          ...prev,
          title: t,
          description: description.trim(),
          introduction: introduction.trim(),
          pricingType,
        };
        if (pricingType === "paid" && tuitionFeeKrw != null) {
          next.tuitionFeeKrw = tuitionFeeKrw;
        } else {
          delete next.tuitionFeeKrw;
        }
        const pr = normalizeExternalUrl(tuitionPaymentUrlDraft);
        if (pricingType === "paid" && pr && isHttpUrl(pr)) {
          next.tuitionPaymentUrl = pr.slice(0, 2048);
        } else {
          delete next.tuitionPaymentUrl;
        }
        return next;
      });
      setIntroSaveOk("저장했습니다. 입장 화면에도 곧바로 반영됩니다.");
    } catch (err) {
      setIntroErr(introSaveErrorMessage(err));
    } finally {
      setSavingIntro(false);
    }
  }

  async function saveStudentChatLink(e?: React.FormEvent) {
    e?.preventDefault();
    if (!id || !room) return;
    const raw = normalizeExternalUrl(studentChatUrlDraft);
    setStudentChatBusy(true);
    setStudentChatErr(null);
    setStudentChatOk(null);
    try {
      if (!raw) {
        await updateDoc(doc(db, "classrooms", id), { studentChatUrl: deleteField() });
        setRoom((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          delete next.studentChatUrl;
          return next;
        });
        setStudentChatOk("저장했습니다. 학생 화면의 「1:1 채팅」버튼을 숨깁니다.");
      } else {
        if (!isHttpUrl(raw)) {
          setStudentChatErr("http(s):// 로 시작하는 전체 주소를 입력해 주세요.");
          return;
        }
        const v = raw.slice(0, 2048);
        await updateDoc(doc(db, "classrooms", id), { studentChatUrl: v });
        setRoom((prev) => (prev ? { ...prev, studentChatUrl: v } : prev));
        setStudentChatUrlDraft(v);
        setStudentChatOk("저장했습니다. 학생에게 「1:1 채팅」버튼으로 표시됩니다.");
      }
    } catch (err) {
      setStudentChatErr(introSaveErrorMessage(err));
    } finally {
      setStudentChatBusy(false);
    }
  }

  function rotateNewLessonDraftSegment() {
    newLessonDraftSegmentRef.current = `_draft_${newLessonMediaId()}`;
  }

  async function persistLessonAttachments(
    lessonId: string,
    videos: LessonVideoItem[],
    materials: LessonMaterialItem[],
  ) {
    if (!id) return;
    const v = serializeVideoItemsForFirestore(videos);
    const m = serializeMaterialItemsForFirestore(materials);
    await updateDoc(doc(db, "classrooms", id, "lessons", lessonId), {
      videoItems: v,
      materialItems: m,
      videoUrl: deleteField(),
      contentId: deleteField(),
      updatedAt: serverTimestamp(),
    });
  }

  async function removePendingNewVideo(itemId: string) {
    const item = pendingNewVideos.find((x) => x.id === itemId);
    if (item?.storagePath?.trim()) {
      try {
        await deleteObject(ref(storage, item.storagePath.trim()));
      } catch {
        /* Storage 이미 삭제됨 등 */
      }
    }
    setPendingNewVideos((prev) => prev.filter((x) => x.id !== itemId));
  }

  async function removePendingNewMaterial(itemId: string) {
    const item = pendingNewMaterials.find((x) => x.id === itemId);
    if (item?.storagePath?.trim()) {
      try {
        await deleteObject(ref(storage, item.storagePath.trim()));
      } catch {
        /* */
      }
    }
    setPendingNewMaterials((prev) => prev.filter((x) => x.id !== itemId));
  }

  function addPendingNewVideoUrl() {
    const raw = newVideoUrlDraft.trim();
    if (!raw) return;
    const norm = normalizeExternalUrl(raw) || raw;
    if (!isHttpUrl(norm)) {
      setLessonErr("영상 URL은 http(s)://로 시작하는 주소를 입력해 주세요.");
      return;
    }
    setLessonErr(null);
    setPendingNewVideos((prev) => [...prev, { id: newLessonMediaId(), url: norm.slice(0, 2048) }]);
    setNewVideoUrlDraft("");
  }

  function addPendingNewMaterialFromFields() {
    const cid = newMaterialCidDraft.trim();
    const uRaw = newMaterialUrlDraft.trim();
    const u = uRaw ? normalizeExternalUrl(uRaw) || uRaw : "";
    if (!cid && !u) {
      setLessonErr("학습 자료는 콘텐츠 ID 또는 자료 URL 중 하나를 입력해 주세요.");
      return;
    }
    if (u && !isHttpUrl(u)) {
      setLessonErr("자료 URL은 http(s)://로 시작하는 주소를 입력해 주세요.");
      return;
    }
    setLessonErr(null);
    setPendingNewMaterials((prev) => [
      ...prev,
      {
        id: newLessonMediaId(),
        contentId: cid ? cid.slice(0, 128) : undefined,
        url: u ? u.slice(0, 2048) : undefined,
      },
    ]);
    setNewMaterialCidDraft("");
    setNewMaterialUrlDraft("");
  }

  async function handleNewLessonVideoFiles(files: FileList | null) {
    if (!files?.length || !id) return;
    setLessonMediaBusy(true);
    setLessonErr(null);
    try {
      for (const file of [...files]) {
        if (file.size > LESSON_VIDEO_BYTES_MAX) {
          setLessonErr(`영상 파일은 ${LESSON_VIDEO_BYTES_MAX / (1024 * 1024)}MB 이하로 올려 주세요: ${file.name}`);
          continue;
        }
        const { url, storagePath, label } = await uploadLessonMediaFile(
          storage,
          id,
          newLessonDraftSegmentRef.current,
          file,
        );
        setPendingNewVideos((prev) => [...prev, { id: newLessonMediaId(), url, storagePath, label }]);
      }
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "영상 업로드에 실패했습니다.");
    } finally {
      setLessonMediaBusy(false);
    }
  }

  async function handleNewLessonMaterialFiles(files: FileList | null) {
    if (!files?.length || !id) return;
    setLessonMediaBusy(true);
    setLessonErr(null);
    try {
      for (const file of [...files]) {
        if (file.size > LESSON_MATERIAL_BYTES_MAX) {
          setLessonErr(`학습 자료 파일은 ${LESSON_MATERIAL_BYTES_MAX / (1024 * 1024)}MB 이하: ${file.name}`);
          continue;
        }
        const { url, storagePath, label } = await uploadLessonMediaFile(
          storage,
          id,
          newLessonDraftSegmentRef.current,
          file,
        );
        setPendingNewMaterials((prev) => [...prev, { id: newLessonMediaId(), url, storagePath, label }]);
      }
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "학습 자료 업로드에 실패했습니다.");
    } finally {
      setLessonMediaBusy(false);
    }
  }

  async function handleLessonVideoFiles(lessonId: string, files: FileList | null) {
    if (!files?.length || !id) return;
    const row = lessonRows.find((r) => r.id === lessonId);
    if (!row) return;
    setLessonMediaBusy(true);
    setLessonErr(null);
    let nextV = [...effectiveLessonVideoItems(row.data)];
    const curM = [...effectiveLessonMaterialItems(row.data)];
    try {
      for (const file of [...files]) {
        if (file.size > LESSON_VIDEO_BYTES_MAX) {
          setLessonErr(`영상 파일은 ${LESSON_VIDEO_BYTES_MAX / (1024 * 1024)}MB 이하: ${file.name}`);
          continue;
        }
        const { url, storagePath, label } = await uploadLessonMediaFile(storage, id, lessonId, file);
        nextV = [...nextV, { id: newLessonMediaId(), url, storagePath, label }];
      }
      await persistLessonAttachments(lessonId, nextV, curM);
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "영상 업로드에 실패했습니다.");
    } finally {
      setLessonMediaBusy(false);
    }
  }

  async function handleLessonMaterialFiles(lessonId: string, files: FileList | null) {
    if (!files?.length || !id) return;
    const row = lessonRows.find((r) => r.id === lessonId);
    if (!row) return;
    setLessonMediaBusy(true);
    setLessonErr(null);
    const curV = [...effectiveLessonVideoItems(row.data)];
    let nextM = [...effectiveLessonMaterialItems(row.data)];
    try {
      for (const file of [...files]) {
        if (file.size > LESSON_MATERIAL_BYTES_MAX) {
          setLessonErr(`학습 자료 파일은 ${LESSON_MATERIAL_BYTES_MAX / (1024 * 1024)}MB 이하: ${file.name}`);
          continue;
        }
        const { url, storagePath, label } = await uploadLessonMediaFile(storage, id, lessonId, file);
        nextM = [...nextM, { id: newLessonMediaId(), url, storagePath, label }];
      }
      await persistLessonAttachments(lessonId, curV, nextM);
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "학습 자료 업로드에 실패했습니다.");
    } finally {
      setLessonMediaBusy(false);
    }
  }

  async function addLessonVideoUrlField(lessonId: string) {
    const raw = (videoUrlDraftByLesson[lessonId] ?? "").trim();
    if (!id) return;
    const row = lessonRows.find((r) => r.id === lessonId);
    if (!row) return;
    if (!raw) {
      setLessonErr("영상 URL을 입력해 주세요.");
      return;
    }
    const norm = normalizeExternalUrl(raw) || raw;
    if (!isHttpUrl(norm)) {
      setLessonErr("영상 URL은 http(s)://로 시작하는 주소를 입력해 주세요.");
      return;
    }
    setLessonErr(null);
    setLessonMediaBusy(true);
    try {
      const nextV = [...effectiveLessonVideoItems(row.data), { id: newLessonMediaId(), url: norm.slice(0, 2048) }];
      await persistLessonAttachments(lessonId, nextV, effectiveLessonMaterialItems(row.data));
      setVideoUrlDraftByLesson((prev) => ({ ...prev, [lessonId]: "" }));
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setLessonMediaBusy(false);
    }
  }

  async function addLessonMaterialFields(lessonId: string) {
    if (!id) return;
    const row = lessonRows.find((r) => r.id === lessonId);
    if (!row) return;
    const cid = (matCidDraftByLesson[lessonId] ?? "").trim();
    const uRaw = (matUrlDraftByLesson[lessonId] ?? "").trim();
    const u = uRaw ? normalizeExternalUrl(uRaw) || uRaw : "";
    if (!cid && !u) {
      setLessonErr("학습 자료는 콘텐츠 ID 또는 자료 URL 중 하나를 입력해 주세요.");
      return;
    }
    if (u && !isHttpUrl(u)) {
      setLessonErr("자료 URL은 http(s)://로 시작하는 주소를 입력해 주세요.");
      return;
    }
    setLessonErr(null);
    setLessonMediaBusy(true);
    try {
      const nextM = [
        ...effectiveLessonMaterialItems(row.data),
        {
          id: newLessonMediaId(),
          contentId: cid ? cid.slice(0, 128) : undefined,
          url: u ? u.slice(0, 2048) : undefined,
        },
      ];
      await persistLessonAttachments(lessonId, effectiveLessonVideoItems(row.data), nextM);
      setMatCidDraftByLesson((prev) => ({ ...prev, [lessonId]: "" }));
      setMatUrlDraftByLesson((prev) => ({ ...prev, [lessonId]: "" }));
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setLessonMediaBusy(false);
    }
  }

  async function removeLessonVideo(lessonId: string, itemId: string) {
    if (!id) return;
    const row = lessonRows.find((r) => r.id === lessonId);
    if (!row) return;
    const cur = effectiveLessonVideoItems(row.data);
    const item = cur.find((x) => x.id === itemId);
    if (item?.storagePath?.trim()) {
      try {
        await deleteObject(ref(storage, item.storagePath.trim()));
      } catch {
        /* */
      }
    }
    setLessonMediaBusy(true);
    setLessonErr(null);
    try {
      await persistLessonAttachments(
        lessonId,
        cur.filter((x) => x.id !== itemId),
        effectiveLessonMaterialItems(row.data),
      );
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setLessonMediaBusy(false);
    }
  }

  async function removeLessonMaterial(lessonId: string, itemId: string) {
    if (!id) return;
    const row = lessonRows.find((r) => r.id === lessonId);
    if (!row) return;
    const cur = effectiveLessonMaterialItems(row.data);
    const item = cur.find((x) => x.id === itemId);
    if (item?.storagePath?.trim()) {
      try {
        await deleteObject(ref(storage, item.storagePath.trim()));
      } catch {
        /* */
      }
    }
    setLessonMediaBusy(true);
    setLessonErr(null);
    try {
      await persistLessonAttachments(
        lessonId,
        effectiveLessonVideoItems(row.data),
        cur.filter((x) => x.id !== itemId),
      );
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setLessonMediaBusy(false);
    }
  }

  async function addClassroomLesson(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !room) return;
    const t = newTitle.trim();
    if (!t) {
      setLessonErr("레슨 제목을 입력해 주세요.");
      return;
    }
    setLessonBusy(true);
    setLessonErr(null);
    try {
      const nextOrder =
        lessonRows.length === 0 ? 0 : Math.max(...lessonRows.map((r) => r.data.orderIndex), 0) + 1;
      const payload: Record<string, unknown> = {
        orderIndex: nextOrder,
        title: t.slice(0, 400),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const u = newUnit.trim();
      if (u) payload.unitTitle = u.slice(0, 200);
      const s = newSummary.trim();
      if (s) payload.summary = s.slice(0, 4000);
      const vs = serializeVideoItemsForFirestore(pendingNewVideos);
      const ms = serializeMaterialItemsForFirestore(pendingNewMaterials);
      if (vs.length) payload.videoItems = vs;
      if (ms.length) payload.materialItems = ms;
      await addDoc(collection(db, "classrooms", id, "lessons"), payload);
      setNewTitle("");
      setNewUnit("");
      setNewSummary("");
      setPendingNewVideos([]);
      setPendingNewMaterials([]);
      setNewVideoUrlDraft("");
      setNewMaterialCidDraft("");
      setNewMaterialUrlDraft("");
      rotateNewLessonDraftSegment();
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "레슨을 추가하지 못했습니다.");
    } finally {
      setLessonBusy(false);
    }
  }

  async function removeClassroomLesson(lessonId: string) {
    if (!id) return;
    const ok = typeof window !== "undefined" ? window.confirm("이 레슨을 삭제할까요?") : false;
    if (!ok) return;
    setLessonBusy(true);
    setLessonErr(null);
    try {
      const row = lessonRows.find((r) => r.id === lessonId);
      const paths = row ? collectLessonStoragePaths(row.data) : [];
      for (const p of paths) {
        try {
          await deleteObject(ref(storage, p));
        } catch {
          /* */
        }
      }
      await deleteDoc(doc(db, "classrooms", id, "lessons", lessonId));
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setLessonBusy(false);
    }
  }

  async function moveClassroomLesson(lessonId: string, delta: -1 | 1) {
    if (!id) return;
    const sorted = [...lessonRows].sort(
      (a, b) => a.data.orderIndex - b.data.orderIndex || a.id.localeCompare(b.id),
    );
    const idx = sorted.findIndex((x) => x.id === lessonId);
    const j = idx + delta;
    if (idx < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[j];
    setLessonBusy(true);
    setLessonErr(null);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "classrooms", id, "lessons", a.id), {
        orderIndex: b.data.orderIndex,
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, "classrooms", id, "lessons", b.id), {
        orderIndex: a.data.orderIndex,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
    } catch (err) {
      setLessonErr(err instanceof Error ? err.message : "순서를 바꾸지 못했습니다.");
    } finally {
      setLessonBusy(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell light>
        <div className="route-loading route-loading--light">
          <div className="route-loading__spinner" />
          <p className="ui-ko">확인 중…</p>
        </div>
      </DashboardShell>
    );
  }

  if (forbidden || !room) {
    return (
      <DashboardShell light>
        <main className="admin-layout classroom-page admin-layout--light">
          <p className="auth-error">
            {forbidden ? "이 강의실을 관리할 권한이 없습니다." : "강의실을 찾을 수 없습니다."}
          </p>
          <Link to="/classroom" className="btn btn--ghost btn--stack">
            목록으로
          </Link>
        </main>
      </DashboardShell>
    );
  }

  const memberCount = room ? (room.memberStudentIds ?? []).length : 0;

  const tabs: { id: TabId; label: string; sub: string }[] = [
    { id: "intro", label: "강의 소개", sub: "이름·요약·상세 소개" },
    { id: "notices", label: "공지사항", sub: "입장 시 팝업·목록" },
    { id: "materials", label: "강의 자료", sub: "파일 업로드·신청 현황" },
    { id: "video", label: "강의 영상", sub: "영상 URL 등록·신청 현황" },
    { id: "qa", label: "질의응답", sub: "게시판" },
    { id: "members", label: "학습지 멤버", sub: "학생 UID 목록" },
  ];

  return (
    <DashboardShell light>
      <main className="admin-layout classroom-page admin-layout--light classroom-hub classroom-hub--manage">
        <div className="classroom-hub__shell">
          <div className="classroom-hub__hero-card">
            <nav className="classroom-page__breadcrumb">
              <Link to="/classroom">← 강의실 목록</Link>
              {" · "}
              <Link to={`/classroom/${room.id}`}>입장 화면</Link>
            </nav>
            <div className="admin-layout__title-row">
              <h1>{room.title}</h1>
              <span className="ui-ko">강의실 허브 — 소개·공지·자료·영상·질의응답</span>
            </div>
            <p className="classroom-page__lede classroom-hub__hero-lede">
              <span className="ui-en" style={{ display: "block", marginBottom: "0.35rem" }}>
                Tabs organize lecture intro, announcements, file/video registration, and Q&amp;A.
              </span>
              <span className="ui-ko">
                탭으로 강의 소개·공지·자료·영상·질의응답을 나눕니다. 자료·영상 <strong>신청</strong>은 관리자 검수 후
                라이브러리에 반영됩니다.
              </span>
            </p>
          </div>

          <div className="classroom-hub__tabs" role="tablist" aria-label="강의실 관리 구역">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={openModal === t.id}
                className={`classroom-hub__tab ${openModal === t.id ? "classroom-hub__tab--active" : ""}`}
                onClick={() => setOpenModal((cur) => (cur === t.id ? null : t.id))}
              >
                <span className="classroom-hub__tab-label">{t.label}</span>
                <span className="classroom-hub__tab-sub">{t.sub}</span>
              </button>
            ))}
          </div>

          {openModal && (
            <ClassroomSectionModal
              open
              title={tabs.find((x) => x.id === openModal)?.label ?? ""}
              subtitle={
                openModal === "intro"
                  ? "이름·요약·상세 소개"
                  : openModal === "notices"
                    ? "입장 시 팝업·목록"
                    : openModal === "materials"
                      ? "파일 업로드·신청 현황"
                      : openModal === "video"
                        ? "영상 URL 등록·신청 현황"
                        : openModal === "qa"
                          ? "게시판"
                          : "학생 UID 목록"
              }
              onClose={() => setOpenModal(null)}
            >
            {openModal === "intro" && (
              <section className="classroom-hub__section" aria-labelledby="hub-intro-h">
                <h2 id="hub-intro-h" className="classroom-hub__section-title">
                  강의 소개 편집
                </h2>
                <p className="classroom-hub__hint">
                  학습자 입장 화면 상단에 표시됩니다. <strong>요약</strong>은 짧은 한 줄, <strong>강의 소개</strong>는 목표·주차
                  안내 등을 자유롭게 작성하세요.
                </p>
                {room.knowledgeMaterialId ? (
                  <div className="classroom-hub__callout classroom-hub__callout--info">
                    <span className="ui-ko">
                      개설 시 <strong>지식 큐레이션</strong> 학습자료가 본문에 합쳐졌습니다. 참조 ID:{" "}
                      <code className="classroom-hub__callout-code">{room.knowledgeMaterialId}</code>
                    </span>
                  </div>
                ) : null}
                <form className="classroom-hub__form" onSubmit={(e) => void saveIntro(e)}>
                  <div className="classroom-hub__card">
                    <h3 className="classroom-hub__card-title">기본 정보</h3>
                    <label className="auth-field">
                      <span className="classroom-hub__field-label">강의실 이름</span>
                      <input
                        className="add-passage__control"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                      />
                    </label>
                    <label className="auth-field">
                      <span className="classroom-hub__field-label">요약 (한 줄)</span>
                      <input
                        className="add-passage__control"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="예: 고2 통합수학 A반 · 2026 봄"
                      />
                    </label>
                    <label className="auth-field">
                      <span className="classroom-hub__field-label">강의 유형 (수강 신청)</span>
                      <select
                        className="add-passage__control"
                        value={pricingType}
                        onChange={(e) => setPricingType(e.target.value === "paid" ? "paid" : "free")}
                      >
                        <option value="free">무료 — 학생이 전체 강의실에서 신청 즉시 수강(멤버 등록)</option>
                        <option value="paid">유료 — 결제 안내 링크·선생님 승인 후 수강</option>
                      </select>
                    </label>
                    {pricingType === "paid" ? (
                      <>
                        <label className="auth-field">
                          <span className="classroom-hub__field-label">수강 가격 (원)</span>
                          <span className="classroom-hub__field-hint">
                            학생의「전체 강의실」목록에 안내 가격으로 표시됩니다.
                          </span>
                          <input
                            className="add-passage__control"
                            inputMode="numeric"
                            autoComplete="off"
                            value={tuitionFeeInput}
                            onChange={(e) => setTuitionFeeInput(e.target.value)}
                            placeholder="예: 150000"
                          />
                        </label>
                        <label className="auth-field">
                          <span className="classroom-hub__field-label">결제·수강 안내 URL</span>
                          <span className="classroom-hub__field-hint">
                            학생이「수강 신청」을 완료하면 새 창에서 열립니다. 결제 여부와 관계없이 아래「유료 수강
                            신청」에서 승인하면 수강이 열립니다. 비우면 링크 없이 신청만 접수됩니다.
                          </span>
                          <input
                            className="add-passage__control"
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            value={tuitionPaymentUrlDraft}
                            onChange={(e) => setTuitionPaymentUrlDraft(e.target.value)}
                            placeholder="https://… (PG·폼·안내 페이지)"
                          />
                        </label>
                      </>
                    ) : null}
                  </div>
                  <div className="classroom-hub__card classroom-hub__card--soft" id="hub-student-chat">
                    <h3 className="classroom-hub__card-title">학생 화면 · 1:1 채팅 (카카오 오픈채팅)</h3>
                    <p className="classroom-hub__hint">
                      카카오톡에서 발급한 <strong>오픈채팅 참여 링크</strong>(예:{" "}
                      <code className="classroom-hub__callout-code">https://open.kakao.com/o/…</code>)를 넣으면,
                      학생 강의실 상단에 <strong>「1:1 채팅」</strong>버튼으로만 보입니다. 비워 두고 저장하면 링크를
                      제거합니다.
                    </p>
                    <div className="classroom-hub__form">
                      <label className="auth-field">
                        <span className="classroom-hub__field-label">오픈채팅 URL</span>
                        <input
                          className="add-passage__control"
                          type="url"
                          inputMode="url"
                          autoComplete="off"
                          value={studentChatUrlDraft}
                          onChange={(e) => setStudentChatUrlDraft(e.target.value)}
                          onKeyDown={(ke) => {
                            if (ke.key !== "Enter") return;
                            ke.preventDefault();
                            void saveStudentChatLink();
                          }}
                          placeholder="https://open.kakao.com/..."
                        />
                      </label>
                      {studentChatErr ? <p className="auth-error">{studentChatErr}</p> : null}
                      {studentChatOk ? <p className="classroom-hub__save-feedback--ok">{studentChatOk}</p> : null}
                      <div className="classroom-hub__cta-row">
                        <button
                          type="button"
                          className="btn btn--primary btn--stack"
                          disabled={studentChatBusy}
                          onClick={() => void saveStudentChatLink()}
                        >
                          {studentChatBusy ? "저장 중…" : "링크 저장"}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--stack"
                          disabled={studentChatBusy || !isHttpUrl(normalizeExternalUrl(studentChatUrlDraft))}
                          onClick={() => {
                            const u = normalizeExternalUrl(studentChatUrlDraft);
                            if (!isHttpUrl(u)) return;
                            window.open(u, "_blank", "noopener,noreferrer");
                          }}
                        >
                          새 창에서 열기
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="classroom-hub__card classroom-hub__card--soft">
                    <h3 className="classroom-hub__card-title">홈 화면 강의 홍보 카드</h3>
                    <p className="classroom-hub__hint">
                      썸네일을 올리면 사이트 <strong>홈</strong>에 디지털마켓과 비슷한 카드가 나타납니다.{" "}
                      <strong>강의 소개 본문</strong>(아래 에디터)이 상세 팝업에 표시되고, 방문자는{" "}
                      <strong>강의 신청</strong>으로 전체 강의실 흐름으로 이어집니다. 이미지는 2MB 이하 JPG·PNG 등을
                      권장합니다.
                    </p>
                    {landingThumbErr ? <p className="auth-error">{landingThumbErr}</p> : null}
                    {(() => {
                      const thumbSrc = landingThumbLocalPreview ?? room.landingPromoThumbnailUrl;
                      return thumbSrc ? (
                      <div style={{ marginBottom: "0.75rem" }}>
                        <img
                          src={thumbSrc}
                          alt=""
                          style={{ maxWidth: "min(100%, 320px)", borderRadius: 12, border: "1px solid #e2e8f0" }}
                        />
                        {landingThumbLocalPreview && landingThumbBusy ? (
                          <p className="classroom-hub__hint" style={{ marginTop: "0.35rem" }}>
                            업로드 중…
                          </p>
                        ) : null}
                      </div>
                      ) : null;
                    })()}
                    <div className="auth-field" style={{ marginBottom: "0.75rem" }}>
                      <span className="classroom-hub__field-label">썸네일 파일</span>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={landingThumbBusy}
                        onChange={(ev) => void uploadLandingPromoThumbnail(ev)}
                      />
                    </div>
                    <div className="classroom-hub__cta-row" style={{ flexWrap: "wrap" }}>
                      {room.landingPromoThumbnailUrl ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--stack"
                          disabled={landingThumbBusy}
                          onClick={() => void removeLandingPromoThumbnail()}
                        >
                          홈에서 내리기
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="classroom-hub__card classroom-hub__card--soft">
                    <h3 className="classroom-hub__card-title">강의 소개 본문</h3>
                    <div className="auth-field classroom-hub__field classroom-hub__field--intro">
                      <span className="classroom-hub__field-label">강의 소개</span>
                      <span className="classroom-hub__field-hint">
                        굵게·링크·이미지 등 서식을 쓸 수 있습니다. 입장 화면에 동일하게 표시됩니다.
                      </span>
                      <RichTextEditor
                        value={introduction}
                        onChange={setIntroduction}
                        placeholder="수업 목표, 주차별 안내, 과제·시험 정책 등을 적어 주세요."
                        userId={firebaseUser?.uid}
                      />
                    </div>
                  </div>
                  <div className="classroom-hub__card">
                    <p className="classroom-hub__preview-label">미리보기 (입장 화면과 동일)</p>
                    <div className="classroom-hub__preview">
                      {(() => {
                        const body = getClassroomIntroBody({
                          ...room,
                          title,
                          description,
                          introduction,
                        });
                        return body ? <RichHtmlView html={body} /> : "소개 글이 비어 있으면 요약만 표시됩니다.";
                      })()}
                    </div>
                    <div className="add-passage__actions classroom-hub__form-actions">
                      <button type="submit" className="btn btn--primary btn--stack" disabled={savingIntro}>
                        {savingIntro ? "저장 중…" : "저장"}
                      </button>
                    </div>
                    <div
                      ref={introFeedbackRef}
                      className="classroom-hub__save-feedback"
                      role="status"
                      aria-live="polite"
                      aria-atomic="true"
                    >
                      {introErr ? <p className="classroom-hub__save-feedback--err">{introErr}</p> : null}
                      {introSaveOk && !introErr ? (
                        <p className="classroom-hub__save-feedback--ok">{introSaveOk}</p>
                      ) : null}
                    </div>
                  </div>
                </form>
                <div className="classroom-hub__card classroom-hub__card--danger classroom-page__danger-zone">
                  <h3>강의실 영구 삭제</h3>
                  <p>
                    <strong>등록된 학습지 멤버(수강생)가 1명이라도 있으면 삭제할 수 없습니다.</strong> 현재 등록된 UID{" "}
                    <strong>{memberCount}</strong>명. 삭제 시 이 강의실의 질문·공지 등 함께 제거됩니다.
                  </p>
                  {deleteClassroomErr ? <p className="auth-error">{deleteClassroomErr}</p> : null}
                  <button
                    type="button"
                    className="btn btn--ghost btn--stack classroom-hub__btn-danger"
                    disabled={memberCount > 0 || deleteClassroomBusy}
                    onClick={() => void deleteClassroomAsTeacher()}
                  >
                    {deleteClassroomBusy ? "삭제 중…" : "강의실 삭제"}
                  </button>
                </div>
              </section>
            )}

          {openModal === "notices" && id && (
            <section className="classroom-hub__section" aria-labelledby="hub-notices-h">
              <h2 id="hub-notices-h" className="classroom-hub__section-title">
                공지사항 관리
              </h2>
              <p className="classroom-hub__hint">
                등록된 공지는 멤버·선생님이 입장할 때 최상단 팝업으로 보이며, 팝업을 닫은 뒤에도 페이지 상단 목록으로
                확인할 수 있습니다. 강의실마다 따로 적용됩니다.
              </p>
              {noticeErr ? <p className="auth-error">{noticeErr}</p> : null}
              <div className="classroom-hub__card">
                <h3 className="classroom-hub__card-title">새 공지 작성</h3>
                <form className="classroom-hub__form" onSubmit={(e) => void addNotice(e)}>
                  <label className="auth-field">
                    <span className="classroom-hub__field-label">새 공지</span>
                    <textarea
                      className="classroom-hub__intro-textarea"
                      rows={4}
                      value={newNoticeBody}
                      onChange={(e) => setNewNoticeBody(e.target.value)}
                      placeholder="전체 학습자에게 전할 안내를 입력하세요."
                      maxLength={8000}
                    />
                  </label>
                  <div className="add-passage__actions classroom-hub__form-actions">
                    <button type="submit" className="btn btn--primary btn--stack" disabled={noticeBusy}>
                      {noticeBusy ? "처리 중…" : "공지 추가"}
                    </button>
                  </div>
                </form>
              </div>
              <div className="classroom-hub__card">
                <h3 className="classroom-hub__subhead classroom-hub__card-title">등록된 공지</h3>
                {noticesLoading ? (
                  <p className="classroom-hub__hint">목록 불러오는 중…</p>
                ) : noticeRows.length === 0 ? (
                  <p className="classroom-hub__hint">등록된 공지가 없습니다.</p>
                ) : (
                  <ul className="classroom-hub__request-list">
                    {noticeRows.map((row) => (
                      <li key={row.id} className="classroom-hub__request-item">
                        <div>
                          <strong>공지</strong>
                          <span className="classroom-hub__request-meta">{tsLabel(row.data.createdAt)}</span>
                        </div>
                        <p className="classroom-hub__request-desc" style={{ whiteSpace: "pre-wrap" }}>
                          {row.data.body.length > 500 ? `${row.data.body.slice(0, 500)}…` : row.data.body}
                        </p>
                        <button
                          type="button"
                          className="btn btn--ghost btn--stack classroom-hub__btn-inline"
                          disabled={noticeBusy}
                          onClick={() => void removeNotice(row.id)}
                        >
                          이 공지 제거
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {openModal === "materials" && (
            <section className="classroom-hub__section" aria-labelledby="hub-mat-h">
              <h2 id="hub-mat-h" className="classroom-hub__section-title">
                강의 자료 업로드
              </h2>
              <p className="classroom-hub__hint">
                이 강의실 <strong>담당 선생님만</strong> 자료를 등록할 수 있습니다. 라이브러리 테마 분류는 홈「새자료
                등록」경로에서만 설정합니다. 교육용으로 즉시 공개하거나 검수 신청 중 선택할 수 있습니다.
              </p>
              <div className="classroom-hub__card">
                <h3 className="classroom-hub__card-title">자료 등록</h3>
                <div className="classroom-hub__cta-row">
                  <Link to={q("/material/register")} className="btn btn--primary btn--stack">
                    자료 등록 신청 열기
                  </Link>
                  <Link to={q("/teacher/homework/new")} className="btn btn--ghost btn--stack">
                    과제 출제 (강의실 연동)
                  </Link>
                </div>
              </div>
              <div className="classroom-hub__card">
                <h3 className="classroom-hub__subhead classroom-hub__card-title">이 강의실로 접수된 자료 신청</h3>
                {listsLoading ? (
                  <p className="classroom-hub__hint">목록 불러오는 중…</p>
                ) : materialRows.length === 0 ? (
                  <p className="classroom-hub__hint">아직 접수된 자료 신청이 없습니다.</p>
                ) : (
                  <ul className="classroom-hub__request-list">
                    {materialRows.map((r) => (
                      <li key={r.id} className="classroom-hub__request-item">
                        <div>
                          <strong>{r.data.title}</strong>
                          <span className="classroom-hub__request-meta">
                            {r.data.status === "pending" && "검수 대기"}
                            {r.data.status === "approved" && "승인됨"}
                            {r.data.status === "rejected" && "반려"}
                            {" · "}
                            {tsLabel(r.data.createdAt)}
                          </span>
                        </div>
                        <p className="classroom-hub__request-desc">
                          {r.data.description.length > 180
                            ? `${r.data.description.slice(0, 180)}…`
                            : r.data.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {openModal === "video" && (
            <section className="classroom-hub__section" aria-labelledby="hub-vid-h">
              <h2 id="hub-vid-h" className="classroom-hub__section-title">
                강의 영상 등록
              </h2>
              <p className="classroom-hub__hint">
                YouTube·Vimeo 등 공개 재생 URL을 제출합니다. 검수 후 콘텐츠로 연결됩니다.
              </p>
              <div className="classroom-hub__card">
                <h3 className="classroom-hub__card-title">영상 링크 등록</h3>
                <div className="classroom-hub__cta-row">
                  <Link to={q("/video/register")} className="btn btn--primary btn--stack">
                    동영상 강의 등록 신청 열기
                  </Link>
                </div>
              </div>
              <div className="classroom-hub__card">
                <h3 className="classroom-hub__subhead classroom-hub__card-title">이 강의실로 접수된 영상 신청</h3>
                {listsLoading ? (
                  <p className="classroom-hub__hint">목록 불러오는 중…</p>
                ) : videoRows.length === 0 ? (
                  <p className="classroom-hub__hint">아직 접수된 영상 신청이 없습니다.</p>
                ) : (
                  <ul className="classroom-hub__request-list">
                    {videoRows.map((r) => (
                      <li key={r.id} className="classroom-hub__request-item">
                        <div>
                          <strong>{r.data.title}</strong>
                          <span className="classroom-hub__request-meta">
                            {r.data.status === "pending" && "검수 대기"}
                            {r.data.status === "approved" && "승인됨"}
                            {r.data.status === "rejected" && "반려"}
                            {" · "}
                            {tsLabel(r.data.createdAt)}
                          </span>
                        </div>
                        <div className="classroom-hub__request-desc">
                          {collectVideoUrlsFromRequest(r.data).map((u, vi) => (
                            <p key={`${r.id}-v-${vi}`} style={{ wordBreak: "break-all", margin: "0.2rem 0 0" }}>
                              {u}
                            </p>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}

          {openModal === "qa" && id && (
            <section className="classroom-hub__section" aria-labelledby="hub-qa-h">
              <h2 id="hub-qa-h" className="classroom-hub__section-title">
                질의응답 게시판
              </h2>
              <p className="classroom-hub__hint">학습자와 소통합니다. 부적절한 글은 삭제할 수 있습니다.</p>
              <div className="classroom-hub__card classroom-hub__card--flush">
                <ClassroomQaBoard classroomId={id} isClassroomTeacher />
              </div>
            </section>
          )}

          {openModal === "members" && id && (
            <section className="classroom-hub__section" aria-labelledby="hub-mem-h">
              <h2 id="hub-mem-h" className="classroom-hub__section-title">
                학습지 배포용 멤버 UID
              </h2>
              <p className="classroom-hub__hint">
                멤버는 <strong>강좌 수강 등록</strong> 시 담당 선생님 학습지 주소록에도 자동으로 올라갑니다.{" "}
                <strong>유료</strong> 강의는 학생이 신청하면「유료 수강 신청」대기 목록에 쌓이며, 승인 후 멤버로
                반영됩니다. 아래에서 UID를 직접 추가·제거할 수도 있습니다. (최대 120명)
              </p>
              {room.pricingType === "paid" && paidEnrollmentRows.length > 0 ? (
                <div className="classroom-hub__card classroom-hub__card--flush-top">
                  <h3 className="classroom-hub__card-title">유료 수강 신청 (승인 대기)</h3>
                  <p className="classroom-hub__hint">
                    결제 완료 여부를 확인하지 않아도 승인할 수 있습니다. 승인 시 멤버·연락처 명단에 반영됩니다.
                  </p>
                  <div className="classroom-hub__roster-scroll">
                    <table className="classroom-hub__roster-table">
                      <thead>
                        <tr>
                          <th scope="col">학생 UID</th>
                          <th scope="col">이메일</th>
                          <th scope="col">전화</th>
                          <th scope="col">신청 시각</th>
                          <th scope="col">처리</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paidEnrollmentRows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <code className="classroom-hub__roster-uid">{row.data.studentId}</code>
                            </td>
                            <td>{row.data.email}</td>
                            <td>{row.data.phone}</td>
                            <td>{tsLabel(row.data.requestedAt)}</td>
                            <td>
                              <div className="classroom-hub__inline-actions">
                                <button
                                  type="button"
                                  className="btn btn--primary btn--stack"
                                  disabled={paidEnrollmentBusyId !== null}
                                  onClick={() => void approvePaidEnrollment(row.data.studentId)}
                                >
                                  승인
                                </button>
                                <button
                                  type="button"
                                  className="btn btn--ghost btn--stack"
                                  disabled={paidEnrollmentBusyId !== null}
                                  onClick={() => void rejectPaidEnrollment(row.data.studentId)}
                                >
                                  거절
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {membersErr ? <p className="auth-error">{membersErr}</p> : null}
              {(room.memberStudentIds ?? []).length > 0 ? (
                <div className="classroom-hub__card classroom-hub__card--flush-top">
                  <h3 className="classroom-hub__card-title">수강생 명단 (연락처)</h3>
                  <p className="classroom-hub__hint">
                    전체 강의실에서 수강 신청으로 등록되면 이메일·전화가 채워집니다. UID만 직접 추가한 멤버는 연락처 칸이 비어
                    있을 수 있습니다.
                  </p>
                  <div className="classroom-hub__roster-scroll">
                    <table className="classroom-hub__roster-table">
                      <thead>
                        <tr>
                          <th scope="col">학생 UID</th>
                          <th scope="col">이메일</th>
                          <th scope="col">전화번호</th>
                          <th scope="col">수강 등록</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(room.memberStudentIds ?? []).map((uidRaw) => {
                          const suid = String(uidRaw).trim();
                          const en = memberEnrollmentById[suid];
                          return (
                            <tr key={suid}>
                              <td>
                                <code className="classroom-hub__roster-uid">{suid}</code>
                              </td>
                              <td>{en?.email ?? "—"}</td>
                              <td>{en?.phone ?? "—"}</td>
                              <td>{en ? tsLabel(en.enrolledAt) : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              <div className="classroom-hub__card">
                <h3 className="classroom-hub__card-title">멤버 추가</h3>
                <form className="classroom-hub__form" onSubmit={(e) => void addSingleMember(e)}>
                  <label className="auth-field">
                    <span className="classroom-hub__field-label">학생 UID 추가</span>
                    <div className="classroom-hub__inline-add">
                      <input
                        type="text"
                        className="add-passage__control classroom-hub__input-grow"
                        value={newMemberUid}
                        onChange={(e) => setNewMemberUid(e.target.value)}
                        placeholder="Firebase Auth UID"
                        disabled={savingMembers}
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <button type="submit" className="btn btn--primary btn--stack" disabled={savingMembers}>
                        {savingMembers ? "처리 중…" : "추가"}
                      </button>
                    </div>
                  </label>
                </form>
              </div>
              <div className="classroom-hub__card">
                <h3 className="classroom-hub__card-title">등록된 멤버</h3>
                {(room.memberStudentIds ?? []).length === 0 ? (
                  <p className="classroom-hub__hint classroom-hub__hint--tight-top">
                    등록된 멤버가 없습니다. 학생이 전체 강의실에서 수강 신청하면 자동으로 채워집니다.
                  </p>
                ) : (
                  <ul className="classroom-member-list">
                    {(room.memberStudentIds ?? []).map((uidRaw) => {
                      const uid = String(uidRaw).trim();
                      const hint = memberRosterHint[uid];
                      return (
                        <li key={uid} className="classroom-member-list__item">
                          <div className="classroom-member-list__main">
                            <code className="classroom-member-list__uid">{uid}</code>
                            {hint?.emailLower || hint?.displayName ? (
                              <span className="classroom-member-list__hint">
                                {[hint?.displayName, hint?.emailLower].filter(Boolean).join(" · ") || ""}
                              </span>
                            ) : (
                              <span className="classroom-member-list__hint classroom-member-list__hint--muted">
                                주소록에 이름·메일이 없음
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn btn--ghost btn--stack classroom-member-list__remove"
                            disabled={savingMembers}
                            onClick={() => void removeSingleMember(uid)}
                          >
                            제거
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <details className="classroom-hub__bulk-paste classroom-hub__bulk-paste--in-card">
                  <summary>여러 UID 한 번에 반영 (붙여넣기)</summary>
                  <form className="classroom-hub__form" onSubmit={(e) => void saveBulkMembers(e)}>
                    <label className="auth-field">
                      <span className="classroom-hub__field-label">학생 UID 목록 — 줄바꿈·쉼표 구분 (최대 120명)</span>
                      <textarea
                        className="classroom-hub__intro-textarea"
                        rows={7}
                        value={bulkMemberText}
                        onChange={(e) => setBulkMemberText(e.target.value)}
                        placeholder="학생 계정의 Auth UID"
                        disabled={savingMembers}
                      />
                    </label>
                    <div className="add-passage__actions classroom-hub__form-actions">
                      <button type="submit" className="btn btn--primary btn--stack" disabled={savingMembers}>
                        {savingMembers ? "저장 중…" : "일괄 반영"}
                      </button>
                    </div>
                  </form>
                </details>
                <div className="add-passage__actions classroom-hub__form-actions classroom-hub__form-actions--spaced">
                  <Link
                    to={`/teacher/assignments/new?classroomId=${encodeURIComponent(id)}`}
                    className="btn btn--ghost btn--stack"
                  >
                    <span className="ui-ko">이 강의실로 학습지 배포 열기</span>
                  </Link>
                </div>
              </div>
            </section>
          )}
            </ClassroomSectionModal>
          )}

          <section className="classroom-hub__card classroom-manage-lessons" aria-labelledby="manage-lessons-h">
            <h2 id="manage-lessons-h" className="classroom-manage-lessons__title">
              강의 레슨·목차 구성
            </h2>
            <p className="classroom-manage-lessons__lede">
              여기서 추가한 레슨은 <strong>학생 입장 화면</strong> 강의 목차에 실시간으로 표시됩니다. 단원명·요약·영상
              (URL 또는 파일)·학습 자료(라이브러리 콘텐츠 ID·URL·파일)를 여러 개 연결할 수 있으며, 각 항목은 삭제할 수
              있습니다. 순서는 위아래 버튼으로 바꿉니다.
            </p>
            {lessonErr ? <p className="auth-error">{lessonErr}</p> : null}
            <form className="classroom-hub__form classroom-manage-lessons__form-grid" onSubmit={(e) => void addClassroomLesson(e)}>
              <label className="auth-field">
                <span className="classroom-hub__field-label">단원 (선택)</span>
                <input
                  className="add-passage__control"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                  placeholder="예: 1단원 독해"
                  disabled={lessonBusy || lessonMediaBusy}
                  maxLength={200}
                />
              </label>
              <label className="auth-field">
                <span className="classroom-hub__field-label">레슨 제목</span>
                <input
                  className="add-passage__control"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 2024년 9월 모의고사 지문 분석"
                  disabled={lessonBusy || lessonMediaBusy}
                  required
                  maxLength={400}
                />
              </label>
              <label className="auth-field" style={{ gridColumn: "1 / -1" }}>
                <span className="classroom-hub__field-label">요약·안내 (선택, 학생 아코디언에 표시)</span>
                <textarea
                  className="classroom-hub__intro-textarea"
                  rows={3}
                  value={newSummary}
                  onChange={(e) => setNewSummary(e.target.value)}
                  disabled={lessonBusy || lessonMediaBusy}
                  maxLength={4000}
                />
              </label>
              <div className="classroom-manage-lessons__attach-block" style={{ gridColumn: "1 / -1" }}>
                <p className="classroom-manage-lessons__attach-heading">이 레슨에 넣을 영상 (선택, 여러 개)</p>
                {pendingNewVideos.length > 0 ? (
                  <ul className="classroom-manage-lessons__attach-list">
                    {pendingNewVideos.map((item) => (
                      <li key={item.id} className="classroom-manage-lessons__attach-item">
                        <div className="classroom-manage-lessons__attach-item-main">
                          <span className="classroom-manage-lessons__attach-name">
                            {item.label ?? (item.storagePath ? "업로드 영상" : "외부 URL")}
                          </span>
                          <span className="classroom-manage-lessons__attach-url" title={item.url}>
                            {item.url.length > 96 ? `${item.url.slice(0, 96)}…` : item.url}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn--ghost classroom-manage-lessons__btn-sm"
                          disabled={lessonBusy || lessonMediaBusy}
                          onClick={() => void removePendingNewVideo(item.id)}
                        >
                          삭제
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="classroom-manage-lessons__attach-controls">
                  <input
                    className="add-passage__control"
                    value={newVideoUrlDraft}
                    onChange={(e) => setNewVideoUrlDraft(e.target.value)}
                    placeholder="https://… 외부 영상 주소"
                    disabled={lessonBusy || lessonMediaBusy}
                    maxLength={2048}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost classroom-manage-lessons__btn-sm"
                    disabled={lessonBusy || lessonMediaBusy}
                    onClick={addPendingNewVideoUrl}
                  >
                    URL 추가
                  </button>
                  <label className="classroom-manage-lessons__file-pick">
                    <span className="classroom-hub__field-label">영상 파일 (다중)</span>
                    <input
                      type="file"
                      accept="video/*"
                      multiple
                      className="classroom-manage-lessons__file-input"
                      disabled={lessonBusy || lessonMediaBusy}
                      onChange={(e) => {
                        void handleNewLessonVideoFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="classroom-manage-lessons__attach-block" style={{ gridColumn: "1 / -1" }}>
                <p className="classroom-manage-lessons__attach-heading">학습 자료 (선택, 여러 개)</p>
                {pendingNewMaterials.length > 0 ? (
                  <ul className="classroom-manage-lessons__attach-list">
                    {pendingNewMaterials.map((item) => (
                      <li key={item.id} className="classroom-manage-lessons__attach-item">
                        <div className="classroom-manage-lessons__attach-item-main">
                          <span className="classroom-manage-lessons__attach-name">
                            {item.label ??
                              (item.contentId?.trim()
                                ? `콘텐츠 ID: ${item.contentId.trim()}`
                                : item.storagePath
                                  ? "업로드 파일"
                                  : "URL 자료")}
                          </span>
                          {item.url?.trim() ? (
                            <span className="classroom-manage-lessons__attach-url" title={item.url.trim()}>
                              {item.url.trim().length > 96 ? `${item.url.trim().slice(0, 96)}…` : item.url.trim()}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="btn btn--ghost classroom-manage-lessons__btn-sm"
                          disabled={lessonBusy || lessonMediaBusy}
                          onClick={() => void removePendingNewMaterial(item.id)}
                        >
                          삭제
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="classroom-manage-lessons__attach-controls classroom-manage-lessons__attach-controls--stack">
                  <label className="auth-field" style={{ flex: "1 1 140px" }}>
                    <span className="classroom-hub__field-label">콘텐츠 ID</span>
                    <input
                      className="add-passage__control"
                      value={newMaterialCidDraft}
                      onChange={(e) => setNewMaterialCidDraft(e.target.value)}
                      placeholder="contents 문서 ID"
                      disabled={lessonBusy || lessonMediaBusy}
                      maxLength={128}
                      spellCheck={false}
                    />
                  </label>
                  <label className="auth-field" style={{ flex: "2 1 200px" }}>
                    <span className="classroom-hub__field-label">자료 URL</span>
                    <input
                      className="add-passage__control"
                      value={newMaterialUrlDraft}
                      onChange={(e) => setNewMaterialUrlDraft(e.target.value)}
                      placeholder="https://… PDF 등"
                      disabled={lessonBusy || lessonMediaBusy}
                      maxLength={2048}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn--ghost classroom-manage-lessons__btn-sm"
                    style={{ alignSelf: "flex-end" }}
                    disabled={lessonBusy || lessonMediaBusy}
                    onClick={addPendingNewMaterialFromFields}
                  >
                    자료 추가
                  </button>
                  <label className="classroom-manage-lessons__file-pick" style={{ flex: "1 1 100%" }}>
                    <span className="classroom-hub__field-label">자료 파일 업로드 (다중)</span>
                    <input
                      type="file"
                      multiple
                      className="classroom-manage-lessons__file-input"
                      disabled={lessonBusy || lessonMediaBusy}
                      onChange={(e) => {
                        void handleNewLessonMaterialFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="add-passage__actions classroom-hub__form-actions" style={{ gridColumn: "1 / -1" }}>
                <button type="submit" className="btn btn--primary btn--stack" disabled={lessonBusy || lessonMediaBusy}>
                  {lessonBusy || lessonMediaBusy ? "처리 중…" : "레슨 추가"}
                </button>
              </div>
            </form>
            {lessonRows.length === 0 ? (
              <p className="classroom-hub__hint">등록된 레슨이 없습니다. 위 폼에서 첫 레슨을 추가해 보세요.</p>
            ) : (
              <ul className="classroom-manage-lessons__lesson-list">
                {lessonRows.map((row, idx) => {
                  const lessonVideos = effectiveLessonVideoItems(row.data);
                  const lessonMaterials = effectiveLessonMaterialItems(row.data);
                  return (
                  <li key={row.id} className="classroom-manage-lessons__lesson">
                    <div className="classroom-manage-lessons__lesson-head">
                      <div>
                        <p className="classroom-manage-lessons__lesson-meta">
                          순서 {idx + 1}
                          {row.data.unitTitle?.trim() ? ` · ${row.data.unitTitle.trim()}` : ""}
                        </p>
                        <h3 className="classroom-manage-lessons__lesson-title">{row.data.title}</h3>
                      </div>
                      <div className="classroom-manage-lessons__lesson-actions">
                        <button
                          type="button"
                          className="btn btn--ghost classroom-manage-lessons__btn-sm"
                          disabled={lessonBusy || lessonMediaBusy || idx === 0}
                          onClick={() => void moveClassroomLesson(row.id, -1)}
                        >
                          위로
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost classroom-manage-lessons__btn-sm"
                          disabled={lessonBusy || lessonMediaBusy || idx >= lessonRows.length - 1}
                          onClick={() => void moveClassroomLesson(row.id, 1)}
                        >
                          아래로
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost classroom-manage-lessons__btn-sm"
                          disabled={lessonBusy || lessonMediaBusy}
                          onClick={() => void removeClassroomLesson(row.id)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    {row.data.summary?.trim() ? (
                      <p className="classroom-hub__hint" style={{ margin: "0.5rem 0 0", whiteSpace: "pre-wrap" }}>
                        {row.data.summary.trim().length > 200
                          ? `${row.data.summary.trim().slice(0, 200)}…`
                          : row.data.summary.trim()}
                      </p>
                    ) : null}
                    <div className="classroom-manage-lessons__lesson-attach">
                      <div className="classroom-manage-lessons__attach-block">
                        <p className="classroom-manage-lessons__attach-heading">영상</p>
                        {lessonVideos.length > 0 ? (
                          <ul className="classroom-manage-lessons__attach-list">
                            {lessonVideos.map((item) => (
                              <li key={item.id} className="classroom-manage-lessons__attach-item">
                                <div className="classroom-manage-lessons__attach-item-main">
                                  <span className="classroom-manage-lessons__attach-name">
                                    {item.label ?? (item.storagePath ? "업로드 영상" : "외부 URL")}
                                  </span>
                                  <span className="classroom-manage-lessons__attach-url" title={item.url}>
                                    {item.url.length > 96 ? `${item.url.slice(0, 96)}…` : item.url}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn--ghost classroom-manage-lessons__btn-sm"
                                  disabled={lessonBusy || lessonMediaBusy}
                                  onClick={() => void removeLessonVideo(row.id, item.id)}
                                >
                                  삭제
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="classroom-hub__hint" style={{ margin: 0 }}>
                            등록된 영상이 없습니다.
                          </p>
                        )}
                        <div className="classroom-manage-lessons__attach-controls">
                          <input
                            className="add-passage__control"
                            value={videoUrlDraftByLesson[row.id] ?? ""}
                            onChange={(e) =>
                              setVideoUrlDraftByLesson((prev) => ({ ...prev, [row.id]: e.target.value }))
                            }
                            placeholder="https://…"
                            disabled={lessonBusy || lessonMediaBusy}
                            maxLength={2048}
                          />
                          <button
                            type="button"
                            className="btn btn--ghost classroom-manage-lessons__btn-sm"
                            disabled={lessonBusy || lessonMediaBusy}
                            onClick={() => void addLessonVideoUrlField(row.id)}
                          >
                            URL 추가
                          </button>
                          <label className="classroom-manage-lessons__file-pick">
                            <span className="classroom-hub__field-label">파일 (다중)</span>
                            <input
                              type="file"
                              accept="video/*"
                              multiple
                              className="classroom-manage-lessons__file-input"
                              disabled={lessonBusy || lessonMediaBusy}
                              onChange={(e) => {
                                void handleLessonVideoFiles(row.id, e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <div className="classroom-manage-lessons__attach-block">
                        <p className="classroom-manage-lessons__attach-heading">학습 자료</p>
                        {lessonMaterials.length > 0 ? (
                          <ul className="classroom-manage-lessons__attach-list">
                            {lessonMaterials.map((item) => (
                              <li key={item.id} className="classroom-manage-lessons__attach-item">
                                <div className="classroom-manage-lessons__attach-item-main">
                                  <span className="classroom-manage-lessons__attach-name">
                                    {item.label ??
                                      (item.contentId?.trim()
                                        ? `콘텐츠: ${item.contentId.trim()}`
                                        : item.storagePath
                                          ? "업로드 파일"
                                          : "URL")}
                                  </span>
                                  {item.url?.trim() ? (
                                    <span className="classroom-manage-lessons__attach-url" title={item.url.trim()}>
                                      {item.url.trim().length > 96
                                        ? `${item.url.trim().slice(0, 96)}…`
                                        : item.url.trim()}
                                    </span>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  className="btn btn--ghost classroom-manage-lessons__btn-sm"
                                  disabled={lessonBusy || lessonMediaBusy}
                                  onClick={() => void removeLessonMaterial(row.id, item.id)}
                                >
                                  삭제
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="classroom-hub__hint" style={{ margin: 0 }}>
                            등록된 학습 자료가 없습니다.
                          </p>
                        )}
                        <div className="classroom-manage-lessons__attach-controls classroom-manage-lessons__attach-controls--stack">
                          <label className="auth-field" style={{ flex: "1 1 140px" }}>
                            <span className="classroom-hub__field-label">콘텐츠 ID</span>
                            <input
                              className="add-passage__control"
                              value={matCidDraftByLesson[row.id] ?? ""}
                              onChange={(e) =>
                                setMatCidDraftByLesson((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                              placeholder="contents ID"
                              disabled={lessonBusy || lessonMediaBusy}
                              maxLength={128}
                              spellCheck={false}
                            />
                          </label>
                          <label className="auth-field" style={{ flex: "2 1 200px" }}>
                            <span className="classroom-hub__field-label">자료 URL</span>
                            <input
                              className="add-passage__control"
                              value={matUrlDraftByLesson[row.id] ?? ""}
                              onChange={(e) =>
                                setMatUrlDraftByLesson((prev) => ({ ...prev, [row.id]: e.target.value }))
                              }
                              placeholder="https://…"
                              disabled={lessonBusy || lessonMediaBusy}
                              maxLength={2048}
                            />
                          </label>
                          <button
                            type="button"
                            className="btn btn--ghost classroom-manage-lessons__btn-sm"
                            style={{ alignSelf: "flex-end" }}
                            disabled={lessonBusy || lessonMediaBusy}
                            onClick={() => void addLessonMaterialFields(row.id)}
                          >
                            자료 추가
                          </button>
                          <label className="classroom-manage-lessons__file-pick" style={{ flex: "1 1 100%" }}>
                            <span className="classroom-hub__field-label">파일 (다중)</span>
                            <input
                              type="file"
                              multiple
                              className="classroom-manage-lessons__file-input"
                              disabled={lessonBusy || lessonMediaBusy}
                              onChange={(e) => {
                                void handleLessonMaterialFiles(row.id, e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </li>
                  );
                })}
              </ul>
            )}
          </section>

        </div>
      </main>
    </DashboardShell>
  );
}

export function ClassroomManagePage() {
  return (
    <TeacherRoute>
      <Inner />
    </TeacherRoute>
  );
}
