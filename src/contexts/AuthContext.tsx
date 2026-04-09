import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, googleAuthProvider } from "@/firebase/config";
import {
  SUPER_ADMIN_EMAIL,
  type UserProfile,
  type UserRole,
} from "@/types/user";

type SignupRoleChoice = "teacher" | "student";

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, choice: SignupRoleChoice) => Promise<void>;
  logOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isSuperAdmin: boolean;
  isTeacherApproved: boolean;
  isPendingTeacher: boolean;
  isStudent: boolean;
  canManageMaterials: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function resolveRoleOnSignup(email: string, choice: SignupRoleChoice): UserRole {
  if (email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
    return "super_admin";
  }
  if (choice === "teacher") return "pending_teacher";
  return "student";
}

async function ensureUserProfileAfterSignIn(user: User) {
  const email = user.email;
  if (!email) return;
  const emailNorm = email.toLowerCase();
  const superNorm = SUPER_ADMIN_EMAIL.toLowerCase();
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const role: UserRole = emailNorm === superNorm ? "super_admin" : "student";
    await setDoc(ref, {
      email,
      role,
      accountStatus: "active",
      verificationFileUrls: [],
      createdAt: serverTimestamp(),
      ...(user.displayName ? { displayName: user.displayName } : {}),
    });
    return;
  }
  const data = snap.data();
  const currentRole = data.role as UserRole | undefined;
  if (emailNorm === superNorm && currentRole !== "super_admin") {
    await updateDoc(ref, { role: "super_admin" });
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubDoc: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const ref = doc(db, "users", user.uid);
      unsubDoc = onSnapshot(
        ref,
        (snap) => {
          if (!snap.exists()) {
            setProfile(null);
            setLoading(false);
            return;
          }
          const d = snap.data();
          const createdRaw = d.createdAt as { toMillis?: () => number } | undefined;
          const verSubRaw = d.verificationSubmittedAt as
            | { toMillis?: () => number }
            | number
            | undefined;
          const verificationSubmittedAt =
            typeof verSubRaw === "number"
              ? verSubRaw
              : typeof verSubRaw?.toMillis === "function"
                ? verSubRaw.toMillis()
                : undefined;
          const p: UserProfile = {
            uid: user.uid,
            email: (d.email as string) ?? user.email ?? "",
            role: d.role as UserProfile["role"],
            accountStatus: (d.accountStatus as UserProfile["accountStatus"]) ?? "active",
            verificationFileUrls: d.verificationFileUrls as string[] | undefined,
            verificationSubmittedAt,
            createdAt: createdRaw?.toMillis?.() ?? Date.now(),
            displayName: d.displayName as string | undefined,
            bankName: d.bankName as string | undefined,
            bankAccountNumber: d.bankAccountNumber as string | undefined,
            accountHolder: d.accountHolder as string | undefined,
          };
          setProfile(p);
          setLoading(false);
          if (p.accountStatus === "banned") {
            signOut(auth).catch(() => {});
          }
        },
        () => setLoading(false)
      );
    });
    return () => {
      unsubDoc?.();
      unsubAuth();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserProfileAfterSignIn(cred.user);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(
      auth,
      googleAuthProvider,
      browserPopupRedirectResolver
    );
    await ensureUserProfileAfterSignIn(cred.user);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, choice: SignupRoleChoice) => {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const role = resolveRoleOnSignup(email, choice);
      await setDoc(doc(db, "users", cred.user.uid), {
        email: cred.user.email,
        role,
        accountStatus: "active",
        verificationFileUrls: [],
        createdAt: serverTimestamp(),
      });
    },
    []
  );

  const logOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  const refreshProfile = useCallback(async () => {
    const u = auth.currentUser;
    if (!u) return;
    const snap = await getDoc(doc(db, "users", u.uid));
    if (!snap.exists()) return;
    const d = snap.data();
    const verSubRaw = d.verificationSubmittedAt as
      | { toMillis?: () => number }
      | number
      | undefined;
    const verificationSubmittedAt =
      typeof verSubRaw === "number"
        ? verSubRaw
        : typeof verSubRaw?.toMillis === "function"
          ? verSubRaw.toMillis()
          : undefined;
    setProfile({
      uid: u.uid,
      email: (d.email as string) ?? u.email ?? "",
      role: d.role as UserProfile["role"],
      accountStatus: (d.accountStatus as UserProfile["accountStatus"]) ?? "active",
      verificationFileUrls: d.verificationFileUrls as string[] | undefined,
      verificationSubmittedAt,
      createdAt: (d.createdAt as { toMillis?: () => number })?.toMillis?.() ?? Date.now(),
      displayName: d.displayName as string | undefined,
      bankName: d.bankName as string | undefined,
      bankAccountNumber: d.bankAccountNumber as string | undefined,
      accountHolder: d.accountHolder as string | undefined,
    });
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const isSuperAdmin = profile?.role === "super_admin" && profile.accountStatus === "active";
    const isTeacherApproved = profile?.role === "teacher" && profile.accountStatus === "active";
    const isPendingTeacher =
      profile?.role === "pending_teacher" && profile.accountStatus === "active";
    const isStudent = profile?.role === "student" && profile.accountStatus === "active";
    const canManageMaterials = isSuperAdmin || isTeacherApproved;
    return {
      firebaseUser,
      profile,
      loading,
      signIn,
      signInWithGoogle,
      signUp,
      logOut,
      refreshProfile,
      isSuperAdmin,
      isTeacherApproved,
      isPendingTeacher,
      isStudent,
      canManageMaterials,
    };
  }, [
    firebaseUser,
    profile,
    loading,
    signIn,
    signInWithGoogle,
    signUp,
    logOut,
    refreshProfile,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
