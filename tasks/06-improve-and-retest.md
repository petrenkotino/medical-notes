# Task 06: Improve + Retest

Apply the bottleneck fix and compare results.

## The improvement
Change `DB_POOL_MAX=1` → `DB_POOL_MAX=10` (no code change, just config).

**Why this works**: With pool=1, all concurrent requests queue for the single DB connection.
With pool=10, up to 10 DB queries run in parallel → throughput scales with concurrency.

## Improved run
```bash
DB_POOL_MAX=10 pnpm dev
k6 run load-tests/k6.js
```

## Expected outcome
- Throughput: 3-5x higher req/s
- p99 latency: significant drop
- Error rate: near 0%

## Done when
Before/after numbers are documented side by side.
