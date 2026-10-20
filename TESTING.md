# Testing Guide

This document describes the test suite for the Mushroom Farm Automation project. It follows the same discipline as the Consistent-Coach suites: tests assert user-visible behavior and real database invariants, not implementation details.

**Current totals:** 113 passing tests.

| Suite | Tests | Runtime requirement |
|---|---|---|
| `client/src/tests` | 56 | Node dependencies only |
| `server/tests/routes` | 28 | Node dependencies only |
| `server/tests/integration` | 15 | PostgreSQL (`TEST_DATABASE_URL`) |
| `ml/tests` | 14 | Python + `requirements-dev.txt` |

---

## 1. Test layout

```
client/src/tests/
├── App.test.js                 # dashboard behavior, filters, CRUD, modals
└── utils/
    └── inventory.test.js       # status, date, money, CSS-class helpers

server/tests/
├── routes/
│   └── inventory.test.js       # HTTP routes with an injected mock pool
└── integration/
    └── schema.test.js          # real Postgres: schema, constraints, migration

ml/tests/
└── test_app.py                 # Flask /health and /predict, explain_row

server/jest.config.js
ml/pytest.ini
```

Client tests live under `src/` because Create React App's Jest runner only scans `src/`. The pure helpers they exercise live in `client/src/utils/inventory.js`, extracted from `App.js` so they can be tested without rendering.

---

## 2. Commands

### Client (Jest + React Testing Library)

```bash
cd client
CI=true npm test -- --watchAll=false
```

Run one file:

```bash
CI=true npm test -- --watchAll=false src/tests/utils/inventory.test.js
```

Run tests matching a name:

```bash
CI=true npm test -- --watchAll=false -t "computes every dashboard statistic"
```

### Server

```bash
cd server

npm run test:unit          # routes only, no database
npm test                   # routes + integration (integration skipped without TEST_DATABASE_URL)
npm run test:integration   # requires TEST_DATABASE_URL
```

### ML

```bash
cd ml
pip install -r requirements-dev.txt
python -m pytest -q
```

### Database integration tests

The suite creates unique schemas inside the target database, runs `schema.sql` and the migration, and drops the schemas afterward. It never touches `public.inventory`.

With a local PostgreSQL:

```bash
docker run --rm -d --name mycelia-pg-test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_USER=test \
  -e POSTGRES_DB=testdb \
  -p 55432:5432 \
  postgres:16-alpine

cd server
TEST_DATABASE_URL=postgres://test:test@localhost:55432/testdb npm run test:integration

docker rm -f mycelia-pg-test
```

On a machine where Docker port publishing is unavailable (as on the current Windows setup), run the suite inside a container on the same Docker network:

```bash
docker network create mycelia-test-net
docker run --rm -d --name mycelia-pg-test --network mycelia-test-net \
  -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=testdb \
  postgres:16-alpine

docker run --rm --network mycelia-test-net \
  -v "$PWD/server:/app" -v mycelia-server-test-modules:/app/node_modules \
  -w /app \
  -e TEST_DATABASE_URL=postgres://test:test@mycelia-pg-test:5432/testdb \
  node:20-alpine \
  sh -c "npm install --no-audit --no-fund --silent && node node_modules/jest/bin/jest.js --runInBand tests/integration"

docker rm -f mycelia-pg-test
docker network rm mycelia-test-net
docker volume rm mycelia-server-test-modules
```

Use a dedicated test database. The suite creates and drops schemas, but it still needs `CREATE SCHEMA` privileges.

---

## 3. What is covered

### Client — pure inventory logic (`inventory.test.js`)

| Area | Cases |
|---|---|
| `parseDateOnly` | local midnight, PostgreSQL timestamp, empty/null/undefined, malformed text, short month, impossible date (`2026-02-31`) |
| `statusForItem` | expired, today, +1/+2/+3 days, +4 days, priority of Expired over low stock, priority of Expiring Soon over low stock, quantities 0/1/4/5/"3"/null, missing expiry, invalid expiry, custom `min_quantity` including 0 |
| `minQuantityFor` | default 5, explicit 0, string coercion |
| `startOfToday` | local midnight |
| `formatDate` | no timezone day shift, invalid inputs return `-` |
| `formatMoney` | two decimals, Indian digit grouping, nullish as zero |
| CSS classes | `Expiring Soon` → `expiring-soon`, row classes |

### Client — dashboard behavior (`App.test.js`)

| Area | Cases |
|---|---|
| Rendering | rows and status pills, loading state, empty state, fetch-error banner |
| Statistics | total batches, low stock, expired, expiring soon, total value |
| Search | product name (case-insensitive), batch number |
| Filters | status, quality grade |
| Sorting | quantity ascending and descending |
| Reset | clear restores defaults |
| Create | modal open, normalized payload (`Number`, trim, uppercase grade), close, refetch |
| Edit | prefill from row, `PUT` to the correct id |
| Delete | confirmation required, cancellation is a no-op, refetch |
| Errors | create and delete failures surface in the banner |
| Modal | overlay click and Cancel close without an API call |

### Server routes (`inventory.test.js`)

Uses `createApp(pool)` with a mock pool; no database required.

| Area | Cases |
|---|---|
| `GET /` | service message |
| `GET /inventory` | rows, empty list, SQL ordered by expiry, database failure → 500 |
| `POST /inventory` | full payload and parameter order, all nine missing fields → 400, empty required strings → 400, zero-value boundaries, SQL-injection string stays a parameter, insert failure → 500 |
| `PUT /inventory/:id` | update and id parameter, 404, database failure → 500 |
| `DELETE /inventory/:id` | delete, 404, database failure → 500 |

### Database (`schema.test.js`, real PostgreSQL)

| Area | Cases |
|---|---|
| Fresh schema | all 11 columns, nullability, `NUMERIC(10,2)` money, `NUMERIC(5,1)` temperature, `DATE` columns |
| Seed data | seven batches, every field populated |
| Idempotency | re-running `schema.sql` does not duplicate rows |
| Constraints | `NOT NULL` violation (`23502`), grade check (`23514`, `inventory_quality_grade_check`) |
| Index | `idx_inventory_expiry` exists |
| Route compatibility | the exact nine-parameter insert works; numeric values return as strings |
| Ordering | soonest expiry first |
| Migration 001 | adds columns, backfills `LEGACY-<id>` / harvest / shelf life / temp / grade, enforces NOT NULL, converts price, is safe twice, accepts the full payload afterward |

### ML (`test_app.py`)

| Area | Cases |
|---|---|
| `/health` | status, model name, feature list, 1,344 training rows, anomaly rate in range |
| `/predict` | typical reading → normal, extreme reading → anomaly with negative score and three explanations, missing field → 400, non-numeric → 400, extra fields ignored |
| `explain_row` | normal message, one note per out-of-range temperature/humidity/CO₂ |

---

## 4. Conventions

These rules keep the suite useful as the project grows.

1. **Test behavior, not implementation.** Assert rendered text, row order, HTTP status, persisted rows, and constraint codes. Do not assert internal function calls unless the call boundary *is* the contract (for example, the exact SQL parameter order).
2. **Use table-driven boundary tests.** `test.each` / `pytest.mark.parametrize` for the values around a threshold: 4 vs 5, 3 vs 4 days, `A`/`B`/`C` vs `D`.
3. **Use a real database for schema and constraint tests.** Mocks cannot prove `NOT NULL`, `CHECK`, indexes, or migration backfills. Use unique schema names and drop them in `afterAll`.
4. **Never encode a bug as expected behavior.** If a scenario exposes a gap, record it in §6 and fix the code or leave the test out until the fix lands. Do not assert "invalid input is accepted" just to stay green.
5. **Mock at the module boundary.** The server tests inject a `pool`; the client tests mock `axios`. Assert that the mock was reached so a specifier drift fails loudly.
6. **Keep tests deterministic.** Dates are built relative to today with local `Date` parts, not hardcoded strings that expire. No arbitrary sleeps; use `findBy*`/`waitFor`.
7. **One reason to fail per test.** A failing test name should tell you what broke without opening the file.
8. **Clean up what you create.** Integration suites drop their schemas; no test depends on leftovers from a previous run.

---

## 5. Adding a test

**For a new server route:**
1. Add the handler to `server/app.js` through `createApp(pool)`.
2. Add a case to `server/tests/routes/inventory.test.js` (or a new file under `tests/routes/`).
3. Assert status, body, and the SQL parameters.
4. If the route touches the schema, add a real-database case under `tests/integration/`.

**For a new client helper:**
1. Put the pure function in `client/src/utils/`.
2. Add it to `client/src/tests/utils/inventory.test.js`.
3. Add boundary cases before wiring it into a component.

**For a new component:**
1. Add `client/src/tests/<Component>.test.js`.
2. Mock `axios` only if the component fetches.
3. Prefer accessible queries (`getByRole`, `getByLabelText`) over CSS selectors. Add `htmlFor`/`id` to labels if a field has no accessible name.
4. Cover the happy path, the error path, and the empty state.

**For a new ML endpoint or model rule:**
1. Add a case to `ml/tests/test_app.py`.
2. Cover the boundary values from `ml/training_report.json` (`p05`, `p95`).

---

## 6. Known gaps and next tests

These are deliberately not tested yet because the behavior is either missing or currently weak. Add them with the corresponding production change.

| Gap | Planned test |
|---|---|
| `PUT` does not validate required fields; missing fields become `NULL` | Missing-field `PUT` → 400; database remains unchanged |
| `POST` only checks presence: `null` numeric fields, negative quantities/prices, non-integer shelf life, impossible dates are accepted | Table-driven invalid-input cases → 400 |
| Database constraint violations return generic 500 (e.g. duplicate `batch_no` if a unique index is added) | Unique violation → 409; check violation → 400 |
| No `unit`, `min_quantity`, or per-item threshold in the schema | Threshold tests once the column lands |
| No stock movements; quantity edits are destructive | `Promise.allSettled` race: two concurrent `OUT` movements cannot both overdraw; negative stock rejected |
| No sensor ingestion or device auth | `POST /api/sensors/readings` missing/invalid device key → 401; batch insert; range validation |
| ML confidence is a heuristic, not a calibrated probability | Percentile-mapping tests once the artifact stores score percentiles |
| No end-to-end browser test | Playwright: add a batch → appears in the table → edit → delete |
| Modal lacks `role="dialog"`, Escape-to-close, focus trap | Accessibility tests with `jest-axe` or role assertions after the modal is upgraded |
| No authentication | Unauthenticated mutation → 401; expired token → 401 |

---

## 7. CI proposal

Run the fast suites on every push and the database suite only where a PostgreSQL service is available.

```yaml
# .github/workflows/test.yml
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci --prefix client
      - run: CI=true npm test --prefix client -- --watchAll=false
      - run: npm ci --prefix server
      - run: npm run test:unit --prefix server
      - uses: actions/setup-python@v5
        with: { python-version: "3.11" }
      - run: pip install -r ml/requirements-dev.txt
      - run: python -m pytest -q ml

  integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci --prefix server
      - run: npm run test:integration --prefix server
        env:
          TEST_DATABASE_URL: postgres://test:test@localhost:5432/testdb
```

---

## 8. Environment variables

| Variable | Used by | Purpose |
|---|---|---|
| `TEST_DATABASE_URL` | server integration suite | PostgreSQL connection string; when absent, integration tests are skipped |
| `CI=true` | client suite | Non-watch mode; warnings fail the production build |
