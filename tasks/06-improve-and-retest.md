# Task 06: Load Test (Stepped Baseline)

Run a capacity-finding load test with default settings. Let results identify the bottleneck.

## k6 script design
- Scenario mix: 70% GET, 20% POST, 10% PUT 
- Pre-seed ~50 notes at script setup for GET/PUT targets
- Per-endpoint tagging so latency and errors are broken down by route
- Correctness checks via k6 `check()` on response status and body shape
- Stepped stages: 10 → 25 → 50 → 100 → 200 VUs, 30s each
- Degradation thresholds: p95 > 500ms OR error rate > 1% OR throughput plateau

## Files to create
- `load-tests/k6.js`

## What to measure
- Throughput (req/s) at each VU step
- p50/p95/p99 latency per endpoint
- Error rate (total + breakdown: 409 conflict vs 5xx)
- 409 rate on PUTs (expected under concurrency — measure separately)
- CPU and memory: `docker stats` in a separate terminal during the run
- Note the VU level where p95 first exceeds 500ms or errors appear — that's the capacity ceiling

## Run
```bash
# Default pool (10), fresh DB state
pnpm dev
k6 run load-tests/k6.js
```

## Done when
Stepped results are recorded and the bottleneck is identified from evidence.
