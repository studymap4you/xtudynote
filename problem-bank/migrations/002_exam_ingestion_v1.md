# 002 - Exam ingestion v1

Firestore is schemaless, so this migration is applied by the first queue and worker writes. No existing document is rewritten or deleted.

## New collections

### `exams/{examId}`

Deterministic ID: `exam_{subject}_g{grade}_{year}_{month}`.

Fields:

- `id`
- `year`
- `grade`
- `month`
- `subject`
- `organizer`
- `title`
- `question_file_path`
- `answer_file_path`
- `script_file_path`
- `source_urls`
- `source_archive`
- `collected_at`
- `updated_at`
- `parse_status`

### `exam_collection_jobs/{jobId}`

Queue state, requested filters, counters, actor metadata, timestamps, and a `targets` subcollection.

## Idempotency

The logical uniqueness key is `year + grade + month + subject + file_type`. It maps to one deterministic exam document and one deterministic Storage object path. Existing objects are skipped by default.

## Rollback

Disable the admin route and worker. Existing `problems`, `sources`, generation records, and Xtudy features are unaffected. Exam documents and Storage objects can remain inert; no runtime question parser depends on them in this migration.
