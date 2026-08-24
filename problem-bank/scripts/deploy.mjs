import { spawnSync } from "node:child_process";

const projectId = process.env.PROBLEM_BANK_PROJECT_ID || "xstudy-problem-bank";
if (projectId !== "xstudy-problem-bank") {
  throw new Error(`Refusing deployment to unexpected project: ${projectId}`);
}

const result = spawnSync(
  "npx",
  [
    "firebase-tools",
    "deploy",
    "--only",
    "functions,firestore",
    "--project",
    projectId,
    "--config",
    "firebase.json",
  ],
  {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PROBLEM_BANK_PROJECT_ID: projectId },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
