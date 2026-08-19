# English Reference Profiles

The textbook generator uses derived editorial profiles rather than fine-tuning on, or republishing, the supplied source books.

## Production collections

- `english_reference_profiles/{profileId}`: generalized unit flow, explanation, question, answer-key, difficulty, layout, and quality-control rules.
- `english_reference_meta/current`: active profile set and schema version.
- `contents/english-reference-{profileId}`: approved Library entry linked to the derived profile.
- `contents/system-english-reference/{profileId}/...`: original PDF or HWP in Firebase Storage.

Original files are stored in Firebase Storage for the Library and are not embedded in Firestore or the repository. Extracted page text is not uploaded. The temporary dataset stays at `/tmp/xtudy-english-reference-db.json` and is excluded from the repository.

The nine derived profiles are also bundled as a seed with the server function. If the production collection is empty, the first authenticated textbook plan request writes that seed to Firestore and immediately uses it. This keeps deployment recoverable without placing source-book text in the repository.

## Rebuild

```bash
python3 scripts/prepare_english_reference_db.py
TEXTBOOK_AI_PROVIDER=nvidia NVIDIA_API_KEY=... node scripts/import-english-reference-profiles.mjs --analyze
node scripts/import-english-reference-profiles.mjs --import
node scripts/import-english-reference-profiles.mjs --verify-only
node scripts/import-english-reference-profiles.mjs --publish-library
node scripts/import-english-reference-profiles.mjs --verify-library
node scripts/import-english-reference-profiles.mjs --export-seed
```

The macOS preparation step uses PDF text extraction first and local Vision OCR only for sampled image-only pages. Windows executables, duplicate archives, Search Console verification files, and unrelated images are excluded.

OpenAI is never used by this pipeline. The derived profile prompt forbids source quotations, publisher branding, and proprietary layout imitation.

Library publication assumes that the operator has the right to distribute each uploaded source. The import is idempotent: a matching fingerprint keeps the existing Storage object, while the corresponding Library document is updated.
