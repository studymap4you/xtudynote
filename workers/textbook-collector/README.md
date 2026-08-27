# Xstudy textbook ingestion worker

This backend-only worker registers the 36 English textbook targets shown in the supplied list and ingests a PDF only when an official HTTPS file URL and explicit reuse permission are both present.

It never runs inside a Vercel request, writes binaries to `public/`, captures secure-viewer screens, reassembles viewer pages, reuses browser login sessions, bypasses DRM/paywalls, or handles CAPTCHA.

## Data flow

```text
catalog.json
  -> source and rights validation
  -> direct PDF download
  -> PDF signature/size/SHA-256 validation
  -> gs://xtudynote.firebasestorage.app/textbook-files/english/...
  -> xstudy-problem-bank / textbook_sources/{id}
```

The supplied `generic_textbook_collector` informed the allowlist, resume state, checksum, and manifest behavior. Its authenticated-session option was intentionally removed. The supplied `generic_pdf_scraper` was not integrated because it captures secure viewer screens and reconstructs files.

## Catalog status

`catalog.json` contains 36 targets:

- `common_english_1`: 10
- `common_english_2`: 10
- `english_1`: 8
- `english_2`: 8

The screenshot is an EXAM4YOU supported-material list, not a public PDF source list. Each entry therefore starts with `rights_status: permission_required` and no `pdf_url`. Running the worker registers private metadata as `awaiting_authorized_source`; it does not download copyrighted files without permission.

For an authorized source, use an uncommitted `catalog.authorized.local.json` and add:

```json
{
  "pdf_url": "https://official-publisher.example/path/book.pdf",
  "rights_status": "permission_granted",
  "permission_evidence": "Contract or official reuse permission reference"
}
```

The PDF host must match `allowed_domains`. Signed URLs, cookies, passwords, storage state, and browser sessions must not be committed.

## Setup

```bash
python3 -m venv .venv-textbook-collector
.venv-textbook-collector/bin/pip install -r workers/textbook-collector/requirements.txt
```

Authenticate with one of:

- `PROBLEM_BANK_SERVICE_ACCOUNT_JSON`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_APPLICATION_CREDENTIALS`
- an unexpired local Firebase CLI session

The credential needs Firestore write access to `xstudy-problem-bank` and object write access to `xtudynote.firebasestorage.app`.

## Run

Validate the catalog without network or cloud writes:

```bash
python3 workers/textbook-collector/textbook_collector.py --register-catalog --collect --dry-run
```

Register the catalog and collect every eligible PDF:

```bash
npm run collect:textbooks
```

Run one target:

```bash
.venv-textbook-collector/bin/python workers/textbook-collector/textbook_collector.py \
  --catalog workers/textbook-collector/catalog.authorized.local.json \
  --register-catalog --collect --target common-english-1-ne-min
```

## Firestore schema

`textbook_sources/{id}` stores course, publisher, author, official source, rights status, visibility, collection status, SHA-256, Storage path, size, and parse status. All records are `master_only` for the designated Xtudy administrator accounts.

The collector does not parse chapters or questions in this stage.
