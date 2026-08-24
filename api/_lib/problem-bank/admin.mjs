import admin from "firebase-admin";

const PROBLEM_BANK_APP_NAME = "xstudy-problem-bank-direct";
const DEFAULT_PROBLEM_BANK_PROJECT_ID = "xstudy-problem-bank";

function parseServiceAccount(raw) {
  if (!raw || raw === "{}") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    throw new Error("problem-bank-service-account-invalid");
  }
}

export function problemBankSettings(env = process.env) {
  const projectId = String(env.PROBLEM_BANK_PROJECT_ID || DEFAULT_PROBLEM_BANK_PROJECT_ID).trim();
  const serviceAccount = parseServiceAccount(
    env.PROBLEM_BANK_SERVICE_ACCOUNT_JSON || env.FIREBASE_SERVICE_ACCOUNT_JSON,
  );
  return {
    projectId,
    serviceAccount,
    enabled: Boolean(projectId && serviceAccount),
    credentialSource: env.PROBLEM_BANK_SERVICE_ACCOUNT_JSON ? "dedicated" : "shared",
  };
}

export function getProblemBankApp(env = process.env) {
  const settings = problemBankSettings(env);
  if (!settings.enabled) throw new Error("problem-bank-not-configured");
  const existing = admin.apps.find((app) => app?.name === PROBLEM_BANK_APP_NAME);
  if (existing) return existing;
  return admin.initializeApp(
    {
      credential: admin.credential.cert(settings.serviceAccount),
      projectId: settings.projectId,
    },
    PROBLEM_BANK_APP_NAME,
  );
}

export function getProblemBankFirestore(env = process.env) {
  return admin.firestore(getProblemBankApp(env));
}

export function problemBankProjectId(env = process.env) {
  return problemBankSettings(env).projectId;
}
