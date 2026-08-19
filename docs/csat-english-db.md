# CSAT English Database

The production database is stored in Firebase, not in the repository.

## Collections

- `csat_english_meta/current`: active schema version and verified counts.
- `csat_english_exams/{year}`: one document for each exam year from 2022 through 2026.
- `csat_english_questions/{year}-odd-{number}`: 225 normalized question records.
- `contents/csat-english-{year}`: five approved Library entries linked to the source PDFs.

Source PDFs are stored under:

`contents/system-csat/csat-english/{year}/`

## Question schema

Each question stores its official answer, score, section, question type, source page and column, extracted question block, shared-passage context, and analysis metadata.

Reading questions 18-45 include deterministic type logic based on the official answer key. The database contains 140 reading records across five years. Listening questions remain marked `pending-transcript` unless a listening script is available and separately analyzed.

## Textbook generation

`api/generate-academy-textbook.mjs` retrieves a balanced set of patterns from all five years. Requested types such as blanks, paragraph order, sentence insertion, grammar, vocabulary, title, topic, and summary receive a higher relevance score. Only answer logic, distractor design, difficulty signals, and new-item generation rules are added to the generation prompt. Long source passages are not copied into generated textbooks.

## Rebuild and verify

```bash
python3 scripts/prepare_csat_english_db.py
node scripts/import-csat-english.mjs --data-only
node scripts/import-csat-english.mjs --verify-only
```

Uploading the original files again is done by omitting `--data-only`.

Semantic per-question rationale enrichment is optional:

```bash
OPENAI_API_KEY=... node scripts/import-csat-english.mjs --analyze --data-only
```

Because this operation sends extracted question text to OpenAI, it must only be run after explicit authorization to transmit the supplied exam material.
