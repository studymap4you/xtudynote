# Xstudy Global Problem Bank

Independent, server-only problem infrastructure for Xstudy Universe.

## Architecture

```text
Xstudy frontend
  -> Xstudy server
    -> HTTPS + bearer service token
      -> problemBankApi (xstudy-problem-bank, asia-northeast3)
        -> Firestore Native Mode
```

The runtime policy is:

```text
Search -> Reuse -> Generate Missing -> Validate -> Save
```

The existing `xtudynote` Firebase project is not a deployment target for this
directory. `.firebaserc`, the deployment wrapper, and the predeploy guard all
require the exact project ID `xstudy-problem-bank`.

## Firestore Schema

Only these top-level collections are used:

- `problems`: problem content, metadata, validation state, embedding, and usage count
- `sources`: normalized source records referenced by `sourceId`
- `generation_runs`: reuse and generation metrics for one workbook request
- `duplicate_clusters`: canonical and duplicate question IDs
- `usage_events`: idempotent workbook/question usage events

Every entity stores its own permanent ID (`questionId`, `sourceId`,
`generationRunId`, `clusterId`, or `eventId`). Firestore document IDs are
internal hashes and are never returned as business identifiers.

Problem states:

```text
raw -> approved -> gold
  \-> rejected
  \-> duplicate
```

Only `approved` and `gold` are eligible for normal search results.

## Search

Search first applies metadata filters for subject, language, exam family,
question type, and status. It then attempts a Firestore nearest-neighbor query
and applies deterministic reranking for:

- semantic/vector similarity
- exact question type match
- difficulty distance
- concept and skill overlap
- quality score
- usage diversity and recent-use penalty
- duplicate-cluster diversity

The initial zero-cost embedding implementation is a deterministic 256-dimension
feature-hash vector. `EmbeddingProvider` and `ProblemSearchProvider` are
interfaces, so a Vertex or another embedding/search provider can replace it
without changing the generation engine. If the vector index is still building,
search falls back to metadata filtering plus in-process cosine scoring.

## API

All endpoints require:

```http
Authorization: Bearer <PROBLEM_BANK_SERVICE_TOKEN>
Content-Type: application/json
```

Endpoints:

- `POST /api/problems/search`
- `POST /api/problems`
- `GET /api/problems/:questionId`
- `POST /api/problems/:questionId/usage`
- `POST /api/generation-runs`

Example search body:

```json
{
  "subject": "english",
  "language": "en",
  "examFamily": "csat",
  "questionType": "blank",
  "difficulty": 4,
  "count": 10,
  "sourceText": "Evidence-based reasoning in an unfamiliar passage",
  "excludeQuestionIds": [],
  "workbookId": "workbook-id"
}
```

Search never fails merely because the bank is short. It returns
`requestedCount`, `foundCount`, and `missingCount` so Xstudy generates only the
missing portion.

`POST /api/problems` always persists a new problem as `raw` first. It then
checks permanent-ID uniqueness, answer and explanation presence, structure,
and content similarity before moving the record to `approved`, `rejected`, or
`duplicate`.

## Security

- Firestore and Storage rules deny every client read and write.
- Only the Admin SDK inside the API accesses the database.
- Writes require the server-side bearer token.
- The Cloud Function can be invoked over HTTPS, but its handler rejects every
  request without the secret token.
- Secrets, source text, full problem text, and personal data are not logged.
- Service account JSON and `.env` files must never be committed.
- Xstudy receives only `PROBLEM_BANK_API_URL` and
  `PROBLEM_BANK_SERVICE_TOKEN` as server environment variables. Never create a
  `VITE_` version of either variable.

## Local Development

Requirements: Node.js 20+, Firebase CLI, and a Firebase project named exactly
`xstudy-problem-bank`.

```bash
cd problem-bank/functions
npm install
npm test

cd ..
firebase emulators:start --project xstudy-problem-bank
```

For emulator requests, put a local token in `functions/.env` using
`functions/.env.example` as the field list. Do not commit that file.

## Deployment

The Firebase project must use the Blaze plan before Cloud Functions v2 and
Secret Manager can be provisioned. Firestore itself can remain within its free
quota, but Firebase requires billing to be linked before those two server
services are enabled.

1. Confirm `xstudy-problem-bank` exists and enable Firestore Native Mode in
   `asia-northeast3`.
2. Link a billing account and switch this project to Blaze in the Firebase
   console. Do not change the `xtudynote` project.
3. Set the API secret:

   ```bash
   firebase functions:secrets:set PROBLEM_BANK_SERVICE_TOKEN --project xstudy-problem-bank
   ```

4. From `problem-bank`, deploy only through the guarded command:

   ```bash
   PROBLEM_BANK_PROJECT_ID=xstudy-problem-bank npm run deploy
   ```

The command deploys only Functions and Firestore rules/indexes to the separate
project. Vector index creation can continue in the background; the metadata
fallback keeps search available during that period. `storage.rules` is ready
for a future binary-assets bucket, but Storage is intentionally not required
for the initial text problem bank.

After deployment, configure the Xstudy server environment:

```env
PROBLEM_BANK_API_URL=https://<region-project-function-url>
PROBLEM_BANK_SERVICE_TOKEN=<same-secret-value>
```

When these values are absent, the current Xstudy generation flow remains
unchanged and does not attempt a Problem Bank call.

## Tests

```bash
cd problem-bank/functions
npm test
```

The suite verifies:

- raw persistence before approval
- missing-answer rejection
- approved/gold-only search
- permanent question ID uniqueness
- duplicate clustering
- 10 requested / 7 reused / 3 generated behavior

## Migration Strategy

`ProblemRepository`, `ProblemSearchProvider`, `EmbeddingProvider`, and
`ValidationService` isolate storage and search details. A future migration to
AlloyDB, Vertex AI Vector Search, or another backend keeps permanent entity IDs
and does not require the Xstudy generation engine to depend on Firestore.
