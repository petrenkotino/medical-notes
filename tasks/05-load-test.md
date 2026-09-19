# Task 05: Load Test

Write the k6 load test script and run baseline results.

## k6 script design
- Ramp: 0 → 50 VUs over 10s, hold 30s, ramp down 10s
- Scenario mix: 70% GET, 20% POST, 10% PUT
- Pre-create ~20 notes at startup to have valid IDs for GET/PUT
- Thresholds: p95 < 500ms, error rate < 1%

## File to create
- `load-tests/k6.js`

## Baseline run
Start server with `DB_POOL_MAX=1`:
```bash
DB_POOL_MAX=1 pnpm dev
k6 run load-tests/k6.js
```

Record: throughput (req/s), p50/p95/p99, error rate.

## Done when
k6 script runs cleanly and baseline metrics are documented.
