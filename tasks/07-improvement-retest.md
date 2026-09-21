# Task 07: Improve + Retest

Identify the bottleneck from Task 06 results, prove it with instrumentation, implement a fix, rerun the test.

## Step 1: Add `application_name` to pool config — DONE

Added `connection: { application_name: 'medical-notes-api' }` to `src/db/pool.ts` so we can filter `pg_stat_activity`.

## Step 2: Sample `pg_stat_activity` at 25 VUs — DONE

### Result

The pool opened all 10 configured connections, while one-second PostgreSQL snapshots usually showed several idle connections. On its own, that appeared inconsistent with sustained pool exhaustion.

However, the database queries complete in milliseconds while sampling occurred approximately once per second. The snapshots could therefore miss short periods in which all connections were occupied and queries were queued inside Postgres.js. This measurement was treated as inconclusive rather than proof that the pool was not limiting throughput.

### `db_waiting` caveat

The original `db_waiting` column counted active backends with any `wait_event_type`. This does not mean an application request was waiting for a pool connection — those waits could be client communication, locks, I/O, or something else.

### Conclusion from Step 2

> `pg_stat_activity` did not show continuous pool exhaustion, but its sampling resolution was too coarse to exclude short-lived pool contention. A controlled pool-size A/B test was required to determine whether pool size materially affected throughput.

## Step 3: A/B pool-size comparison — DONE

The API was restarted before each run. Both tests used 25 VUs, a separate 15-second warm-up, and a 60-second measured run. The only intended configuration change was `DB_POOL_MAX`.

### Improved sampler query

Run in a separate terminal tab (no backgrounding):

```bash
(
  echo "timestamp,connections,active,idle,client_waiting,lock_waiting,io_waiting,lwlock_waiting"
  while true; do
    docker compose exec -T postgres \
      psql -U postgres -d medical_notes -At -F ',' -c "
        SELECT
          clock_timestamp(),
          count(*),
          count(*) FILTER (WHERE state = 'active'),
          count(*) FILTER (WHERE state = 'idle'),
          count(*) FILTER (
            WHERE state = 'active' AND wait_event_type = 'Client'
          ),
          count(*) FILTER (
            WHERE state = 'active' AND wait_event_type = 'Lock'
          ),
          count(*) FILTER (
            WHERE state = 'active' AND wait_event_type = 'IO'
          ),
          count(*) FILTER (
            WHERE state = 'active' AND wait_event_type = 'LWLock'
          )
        FROM pg_stat_activity
        WHERE application_name = 'medical-notes-api';
      "
    sleep 1
  done
) > load-tests/results/pg-ab-pool10.csv
```

### Run procedure

Restart the API before each run. Truncate DB before the whole A/B series (not between runs).

**Run A (pool=10):**
```bash
# Terminal 1: start API
DB_POOL_MAX=10 node dist/index.js

# Terminal 2: warm-up (discard)
k6 run --env VUS=25 --env DURATION=15s load-tests/k6.js > /dev/null 2>&1

# Terminal 3: start sampler THEN run measured test in Terminal 2
k6 run --env VUS=25 --env DURATION=60s load-tests/k6.js
# Ctrl+C sampler after test finishes
```

**Run B (pool=20):**
```bash
# Restart API with new pool size
DB_POOL_MAX=20 node dist/index.js

# Same procedure, output to pg-ab-pool20.csv
```

### Results

| Metric | Pool 10 | Pool 20 | Change |
| --- | ---: | ---: | ---: |
| Throughput | 6,619 req/s | 10,086 req/s | +52.4% |
| Overall p95 | 5.68 ms | 4.45 ms | -21.7% |
| GET p95 | 5.34 ms | 3.16 ms | -40.8% |
| POST p95 | 6.20 ms | 5.70 ms | -8.1% |
| PUT p95 | 6.27 ms | 5.85 ms | -6.7% |
| Infrastructure errors | 0.00% | 0.00% | No regression |
| Average active DB connections | 2.33 | 5.45 | +134% |
| Maximum active DB connections | 8 | 19 | Pool 20 used more than 10 |

Increasing the pool from 10 to 20 materially improved both throughput and latency. The pool-20 run reached 19 active database connections, demonstrating useful concurrency that a pool of 10 could not provide. Pool size was therefore a meaningful constraint, although this does not establish it as the service's only bottleneck.

The pool-20 run followed the pool-10 run, so PostgreSQL cache state and run order are possible confounders. Both runs had their own warm-up, and the improvement was substantially larger than the variation observed across the earlier pool-10 measurements. The full before/after series will reset the database to the same starting state before each series.

## Step 3b: Pool-size sweep at 50 VUs — DONE

Ran pool sizes 20, 30, 40, and 50 at 50 VUs to find the optimal setting.

| Pool | req/s | Overall p95 | GET p95 | POST p95 | PUT p95 | Conflicts/s |
|-----:|------:|------------:|--------:|---------:|--------:|------------:|
| 20 | 8,509 | 9.20ms | 8.35ms | 10.47ms | 10.65ms | 24 |
| 30 | 8,588 | 8.65ms | 7.77ms | 10.00ms | 10.11ms | 25 |
| 40 | 10,028 | 10.72ms | 6.37ms | 14.24ms | 14.44ms | 77 |
| 50 | 10,131 | 11.85ms | 5.60ms | 14.27ms | 14.61ms | 108 |

Pool 40 vs pool 50: throughput only 1.0% lower, overall p95 9.5% better, write p95 marginally better, conflicts 28.7% lower, 20% fewer PG connections.

`pg_stat_activity` confirmed pool 50 only reached 34 active connections (vs 32 for pool 40) — the extra 10 reserved connections delivered negligible benefit.

> At 50 VUs, increasing the pool from 30 to 40 improved throughput by ~16.8%. Increasing from 40 to 50 produced only 1.0% more, while worsening overall p95 and increasing conflicts. Pool 40 is the smallest near-optimal configuration.

## Step 4: Apply the fix — DONE

Use `DB_POOL_MAX=40` for the improved test series. This is the smallest pool size near the throughput ceiling, balancing connection budget against diminishing returns.

The setting remains environment-configurable so it can be sized alongside the number of API replicas and PostgreSQL's total connection limit.

## Step 5: Full retest — DONE

Reran the same 10/25/50/100/200-VU series with `DB_POOL_MAX=40`. Each level used a separate 15-second warm-up followed by a 60-second measured run. All correctness checks passed, with zero HTTP or infrastructure errors.

### Pool-40 results

| VUs | req/s | p50 GET | p95 GET | p99 GET | infra err% | API peak CPU | API peak RSS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 7,393 | 0.88 ms | 2.15 ms | 6.49 ms | 0.00% | 93% | 211 MiB |
| 25 | 10,305 | 1.67 ms | 3.02 ms | 4.04 ms | 0.00% | 97% | 215 MiB |
| 50 | 10,159 | 3.74 ms | 6.07 ms | 8.48 ms | 0.00% | 105% | 207 MiB |
| 100 | 6,342 | 15.01 ms | 20.92 ms | 23.00 ms | 0.00% | 109% | 287 MiB |
| 200 | 4,199 | 46.49 ms | 63.59 ms | 79.29 ms | 0.00% | 105% | 331 MiB |

CPU and RSS use the final 60 seconds of each API activity block, excluding its 15-second warm-up.

### Before/after comparison

| VUs | Pool 10 req/s | Pool 40 req/s | Throughput change | Pool 10 GET p95 | Pool 40 GET p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 8,708 | 7,393 | -15.1% | 1.33 ms | 2.15 ms |
| 25 | 7,298 | 10,305 | +41.2% | 4.82 ms | 3.02 ms |
| 50 | 4,396 | 10,159 | +131.1% | 15.31 ms | 6.07 ms |
| 100 | 3,373 | 6,342 | +88.1% | 40.20 ms | 20.92 ms |
| 200 | 2,860 | 4,199 | +46.8% | 90.36 ms | 63.59 ms |

The pool-40 series peaked at approximately 10,305 req/s at 25 VUs. At 50 VUs, throughput was essentially flat at 10,159 req/s while GET p95 doubled from 3.02 ms to 6.07 ms. Throughput then fell substantially at 100 and 200 VUs.

> The highest demonstrated pre-degradation load moved from 10 VUs with pool 10 to 25 VUs with pool 40. The first observed degradation moved from 25 to 50 VUs. Peak measured throughput increased from 8,708 to 10,305 req/s (+18.3%).

The 10-VU result regressed by 15.1%. Because only one local run was performed per configuration, this should be reported as run-to-run or local-environment variability rather than hidden or attributed to the pool without more repetitions.

The larger pool also increased expected optimistic-concurrency conflicts, especially around 25–50 VUs, because more updates reached PostgreSQL concurrently instead of being partially serialized in the client queue. Expected `409` responses are counted in request throughput, so aggregate throughput is not identical to successful business-update throughput. Peak API RSS at 200 VUs increased from 293 MiB to 331 MiB.

## Directional multi-process experiment — DONE

After pool tuning, ran one exploratory 200-VU test with two Node.js workers. The total database connection budget remained fixed at 40, isolating the effect of additional application workers as much as possible:

| Configuration | Workers | Pool per worker | Total pool |
| --- | ---: | ---: | ---: |
| Baseline | 1 | 40 | 40 |
| Scaled | 2 | 20 | 40 |

| Metric | 1 worker × pool 40 | 2 workers × pool 20 | Change |
| --- | ---: | ---: | ---: |
| Throughput | 4,199 req/s | 11,734 req/s | +179.4% |
| Overall p95 | 63.78 ms | 42.02 ms | -34.1% |
| Overall p99 | 79.76 ms | 61.76 ms | -22.6% |
| GET p95 | 63.59 ms | 38.54 ms | -39.4% |
| POST p95 | 64.28 ms | 47.58 ms | -26.0% |
| PUT p95 | 64.15 ms | 47.92 ms | -25.3% |
| Infrastructure errors | 0.00% | 0.00% | No regression |
| Aggregate API CPU | 97.0% avg | 177.5% avg | Used a second core |
| Peak aggregate RSS | 331 MiB | 434 MiB | +31.1% |

The workers averaged 89.4% and 88.1% CPU, confirming that load was distributed evenly and that the second process used another CPU core. All correctness checks passed.

This is directional evidence, not part of the formal before/after claim: it was a single unpaired run against a database whose state differed from the single-worker run. The greater-than-2x throughput result may also include effects from separate V8 heaps, garbage collection, cache state, and local-host variability. A controlled multi-level retest would be required before treating it as a production capacity result.

It nevertheless makes multi-process or horizontally scaled API instances the strongest next optimization candidate. Pools must be budgeted across replicas because total possible database connections equal `replicas × pool size`.

## Done when

- `pg_stat_activity` data collected ✅ (step 2)
- A/B comparison completed ✅
- `DB_POOL_MAX=40` selected from pool sweep ✅
- Before/after comparison table filled for all 5 VU levels ✅
- Directional two-worker experiment completed ✅
