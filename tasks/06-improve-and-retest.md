# Task 06: Load Test (Capacity Baseline)

Run a capacity-finding load test with default settings. Let results identify the bottleneck.

## k6 script design
- Scenario mix: 70% GET, 20% POST, 10% PUT
- Pre-seed exactly 50 notes in `setup()` (tagged `endpoint: 'setup'`); setup fails if fewer than 50 are created
- Per-endpoint tagging on all requests for built-in metric breakdown
- `check()` validates status **and** response shape; failures increment `infra_error_rate`
- 409s on PUT are declared expected via `responseCallback: http.expectedStatuses(200, 409)`, keeping `http_req_failed` clean

### Authoritative workload metrics

The built-in `http_reqs` and `http_req_duration` aggregates include the 50 `setup()` requests. Use these custom metrics for analysis instead:

| What to measure | Metric |
|---|---|
| Throughput | rate of `workload_requests_total` (tagged by `endpoint`) |
| GET latency | `get_duration` |
| POST latency | `post_duration` |
| PUT latency (incl. 409s) | `put_duration` |
| Infra / correctness error rate | `infra_error_rate` |
| Expected PUT conflicts | `put_conflicts_total` |

## Load levels and run structure
Run an unreported warm-up followed by a separate measured invocation at each load level. Both invocations use the `constant-vus` executor; there is no ramp inside the measured run, so its summary contains steady-state measurements only.

```bash
# Example for 10 VUs: discard the 15s warm-up summary, then record the 60s run
k6 run --env VUS=10 --env DURATION=15s load-tests/k6.js > /dev/null 2>&1
k6 run --env VUS=10 --env DURATION=60s load-tests/k6.js
```

Repeat the same pair at 25, 50, 100, and 200 VUs. Reset the database to the same starting state before each before/after test series (not between individual VU levels within a series):

```bash
docker exec -i medical-notes-postgres-1 \
  psql -U postgres -d medical_notes -c "TRUNCATE medical_notes;"
```

The warm-up prepares the API process, database connection pool, and database caches. Because k6 starts a new process for the measured invocation, do not claim that its own connections or runtime remain warm. Only the 60-second invocation is included in the results table.

No latency or error-rate SLA was provided in the assignment. Degradation is assessed comparatively: throughput plateaus or declines as concurrency increases while latency rises, or unexpected errors emerge.

## Files to create
- `load-tests/k6.js` — parameterised by `VUS` and `DURATION` env vars and configured with the `constant-vus` executor

## Resource measurement
Terminal 1 — PostgreSQL (Docker):
```bash
docker stats medical-notes-postgres-1 --format "table {{.CPUPerc}}\t{{.MemUsage}}"
```

Terminal 2 — API process (native):
```bash
# Build and start the API, capturing the Node process directly
pnpm build
node dist/index.js &
api_pid=$!

# Start sampling immediately before the measured (not warm-up) invocation.
# Use a per-VU-level filename so runs don't overwrite each other.
# Replace 10vus with the actual level being measured (25vus, 50vus, …).
mkdir -p load-tests/results
(
  while kill -0 "$api_pid" 2>/dev/null; do
    printf "%s " "$(date -u +%FT%TZ)"
    ps -o pid=,pcpu=,rss= -p "$api_pid"
    sleep 2
  done
) > load-tests/results/api-10vus.log &
stats_pid=$!

# After testing, stop the sampler and API
kill "$stats_pid" "$api_pid" 2>/dev/null || true
wait "$stats_pid" "$api_pid" 2>/dev/null || true
```

Record peak CPU% and RSS for both during the measured 60-second invocation only; exclude the warm-up samples.

## Done when
Results table (VUs / req/s / p50 / p95 / p99 / error% / API RSS / PG CPU) filled in for all 5 levels and the capacity ceiling is identified.

## Status: DONE

Config: `DB_POOL_MAX=10`, Node 24, native API + Dockerised Postgres 17 on same machine as k6.

Throughput and latency are from the custom workload metrics (`workload_requests_total`, `get_duration`). PG CPU was not captured from `docker stats`.

| VUs | req/s | p50 GET | p95 GET | p99 GET | infra err% | API peak CPU | API peak RSS |
|-----|-------|---------|---------|---------|------------|--------------|--------------|
|  10 | 8,708 | 0.85ms  | 1.33ms  | 1.73ms  | 0.00%      | 97%          | 208 MiB      |
|  25 | 7,298 | 3.05ms  | 4.82ms  | 5.53ms  | 0.00%      | 107%         | 213 MiB      |
|  50 | 4,396 | 11.16ms | 15.31ms | 16.99ms | 0.00%      | 102%         | 224 MiB      |
| 100 | 3,373 | 29.39ms | 40.20ms | 43.32ms | 0.00%      | 106%         | 258 MiB      |
| 200 | 2,860 | 70.45ms | 90.36ms | 96.23ms | 0.00%      | 105%         | 293 MiB      |

`http_req_failed` was 0.00% at all levels. PUT conflicts tracked separately via `put_conflicts_total`.

### Observed degradation and initial diagnosis

Throughput peaks at 10 VUs and falls at every subsequent step:

```
10 VUs →  8,708 req/s
25 VUs →  7,298 req/s   ← first observed drop
50 VUs →  4,396 req/s
100 VUs → 3,373 req/s
200 VUs → 2,860 req/s
```

The baseline proves that the system reached saturation: throughput declined beyond 10 VUs, latency rose, and the Node process consumed approximately one CPU core. The baseline did not isolate whether the limiting factor was application CPU, database connection availability, or another shared resource. A controlled pool-size comparison was performed to identify whether pool size contributed.

The highest observed throughput was approximately 8,700 requests per second at 10 VUs. The first observed degradation occurred at 25 VUs, where throughput declined while latency increased. Because loads below 10 VUs were not tested, the exact throughput knee is unknown; 10 VUs is the highest demonstrated pre-degradation level, not a claim that the exact capacity boundary is 10 VUs.

Follow-up: instrument PostgreSQL and run a controlled pool-size comparison → see Task 07.
