# Xstudy Global Problem Bank

Private problem and exam metadata infrastructure for Xstudy Universe. The project ID is fixed to `xstudy-problem-bank`.

## Runtime architecture

```text
Xstudy frontend
  -> Xstudy Vercel API (Firebase Admin SDK)
    -> xstudy-problem-bank Firestore

Admin collection screen
  -> lightweight Vercel queue API
    -> exam_collection_jobs
      -> external ingestion worker
        -> EBSi public archive
        -> Xtudy Object Storage
        -> exams metadata
```

No separate Problem Bank HTTP Function is required. Browser clients never receive a problem-bank credential and cannot access the database directly.

The question runtime policy remains:

```text
Search -> Reuse -> Generate Missing -> Validate -> Save
```

## Firestore schema

- `problems`: validated question content and search metadata
- `sources`: normalized source records referenced by `sourceId`
- `generation_runs`: workbook reuse and generation metrics
- `duplicate_clusters`: canonical and duplicate question IDs
- `usage_events`: idempotent workbook/question usage events
- `exams`: one mock exam per subject/grade/year/month
- `exam_collection_jobs`: external worker queue and aggregate progress
- `exam_collection_jobs/{jobId}/targets`: target-level ingestion results

Problem states:

```text
raw -> approved -> gold
  \-> rejected
  \-> duplicate
```

Only `approved` and `gold` problems are reused by the generation engine. Exam parsing is intentionally outside the current ingestion migration; new exams start with `parse_status: not_started`.

## Storage

Binary exam files are not stored in Firestore, GitHub, or the frontend `public/` directory. The worker reuses the private Xtudy Firebase Storage bucket:

```text
gs://xtudynote.firebasestorage.app/exam-files/english/
  grade1/2025/03/question.pdf
  grade1/2025/03/answer.pdf
  grade1/2025/03/script.pdf
```

The extension follows the official file. Some EBSi answer keys are PNG files, while full explanations are normally PDF files. A full PDF explanation is preferred when both are available.

## Server credentials

Vercel accepts either a dedicated credential or the existing server credential:

```env
PROBLEM_BANK_PROJECT_ID=xstudy-problem-bank
PROBLEM_BANK_SERVICE_ACCOUNT_JSON={...}
```

If `PROBLEM_BANK_SERVICE_ACCOUNT_JSON` is omitted, the server uses `FIREBASE_SERVICE_ACCOUNT_JSON`. That service account must have Firestore read/write IAM permission on `xstudy-problem-bank`. Never expose either value through a `VITE_` variable.

The ingestion worker supports the same JSON variables, `GOOGLE_APPLICATION_CREDENTIALS`, and a short-lived local Firebase CLI session. See [`workers/exam-collector/README.md`](../workers/exam-collector/README.md).

## Security

- Firestore rules deny all browser reads and writes.
- Only Admin SDK server code and the external worker access Firestore.
- The admin queue API verifies the Xtudy Firebase ID token and active `super_admin` role.
- The Vercel endpoint never launches Playwright or downloads exam files.
- Logs and API responses do not include credentials.

## Deployment

Deploying a Cloud Function for this repository is unnecessary. Firestore rules and indexes remain deployable independently:

```bash
npx firebase-tools deploy --only firestore --project xstudy-problem-bank --config problem-bank/firebase.json
```

GitHub/Vercel deploys the Xtudy API and admin UI. Run the exam worker separately on a trusted machine or worker host.

## Tests

```bash
npm run test:csat-question-engine
npm run test:exam-collector
```

The independent Function implementation remains in `problem-bank/functions` as a tested reference and rollback path, but it is not required by the selected direct-Firestore runtime.
