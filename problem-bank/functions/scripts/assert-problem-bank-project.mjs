const expectedProjectId = "xstudy-problem-bank";

function configuredProjectId() {
  if (process.env.PROBLEM_BANK_PROJECT_ID) return process.env.PROBLEM_BANK_PROJECT_ID;
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  if (process.env.GOOGLE_CLOUD_PROJECT) return process.env.GOOGLE_CLOUD_PROJECT;
  try {
    const config = JSON.parse(process.env.FIREBASE_CONFIG || "{}");
    return config.projectId || "";
  } catch {
    return "";
  }
}

const projectId = configuredProjectId();
if (projectId !== expectedProjectId) {
  console.error(
    `Refusing Problem Bank deployment. Expected ${expectedProjectId}, received ${projectId || "no project"}.`,
  );
  process.exit(1);
}

console.log(`Problem Bank deployment target verified: ${projectId}`);
