export const SUPER_ADMIN_EMAILS = [
  "waterfallingsound0827@gmail.com",
  "studymap0904@gmail.com",
] as const;

export const SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAILS[0];

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.trim().toLowerCase();
  return Boolean(normalized && SUPER_ADMIN_EMAILS.some((adminEmail) => adminEmail === normalized));
}

export type UserRole = "super_admin" | "teacher" | "pending_teacher" | "student";

export type AccountStatus = "active" | "banned";

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  accountStatus: AccountStatus;
  /** Storage download URLs for 재직증명서/신분증 */
  verificationFileUrls?: string[];
  verificationSubmittedAt?: number;
  createdAt: number;
  displayName?: string;
  /** 승인된 선생님 정산 계좌 (세분화) */
  bankName?: string;
  bankAccountNumber?: string;
  accountHolder?: string;
}
