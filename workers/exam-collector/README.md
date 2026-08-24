# XUniverse EBSi exam ingestion worker

This worker collects only files exposed by the official public EBSi previous-exam archive. It does not bypass login, DRM, paywalls, or access controls.

## Architecture

- The Vercel admin API only creates records in `exam_collection_jobs`.
- This worker claims a queued job outside Vercel.
- Binary files are stored in `gs://xtudynote.firebasestorage.app/exam-files/english/...`.
- Metadata and job state are stored in the `xstudy-problem-bank` Firestore project.
- No downloaded exam file is written to `public/` or committed to Git.

## Setup

```bash
python3 -m venv .venv-exam-collector
.venv-exam-collector/bin/pip install -r workers/exam-collector/requirements.txt
```

The request-only Playwright collector does not require a browser download. Authenticate with one of:

- `PROBLEM_BANK_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_APPLICATION_CREDENTIALS`
- an unexpired local Firebase CLI session for a short local run

The credential needs Firestore access to `xstudy-problem-bank` and object write access to the Xtudy Storage bucket.

## Run

Process one queued admin job:

```bash
npm run collect:exams
```

Process a specific job:

```bash
.venv-exam-collector/bin/python workers/exam-collector/xuniverse_ebsi_collector.py --job-id JOB_ID
```

Create and process a narrow local job:

```bash
.venv-exam-collector/bin/python workers/exam-collector/xuniverse_ebsi_collector.py \
  --create-job --start-year 2025 --end-year 2025 --grades 1 --months 3
```

Discovery/download validation without cloud writes:

```bash
.venv-exam-collector/bin/python workers/exam-collector/xuniverse_ebsi_collector.py \
  --dry-run --start-year 2025 --end-year 2025 --grades 1 --months 3
```

## Firestore collections

- `exams/{examId}`: one English exam per grade/year/month
- `exam_collection_jobs/{jobId}`: queue and aggregate progress
- `exam_collection_jobs/{jobId}/targets/{targetId}`: target-level status

The deterministic storage object name and exam document ID make repeated runs idempotent. Existing objects are skipped unless they are missing from Storage.
