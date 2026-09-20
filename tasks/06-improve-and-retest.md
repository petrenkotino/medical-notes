# Task 06: Load Test (Capacity Baseline)

Run a capacity-finding load test with default settings. Let results identify the bottleneck.

## k6 script design
- Scenario mix: 70% GET, 20% POST, 10% PUT
- Pre-seed ~50 notes in `setup()` for GET/PUT targets
- Per-endpoint tagging (`{ tags: { endpoint: 'get' } }`) for latency/error breakdown
- Correctness checks via k6 `check()` on status and response body shape
- 409s on PUT are expected — tracked separately, excluded from infrastructure error rate

## Load levels and run structure
Run an unreported warm-up followed by a separate measured invocation at each load level. Both invocations use the `constant-vus` executor; there is no ramp inside the measured run, so its summary contains steady-state measurements only.

```bash
# Example for 10 VUs: discard the 15s warm-up summary, then record the 60s run
k6 run --env VUS=10 --env DURATION=15s load-tests/k6.js > /dev/null 2>&1
k6 run --env VUS=10 --env DURATION=60s load-tests/k6.js
```

Repeat the same pair at 25, 50, 100, and 200 VUs. Reset the database to the same starting state before each warm-up/measured pair, and use the same reset procedure for the before and after test series.

The warm-up prepares the API process, database connection pool, and database caches. Because k6 starts a new process for the measured invocation, do not claim that its own connections or runtime remain warm. Only the 60-second invocation is included in the results table.

Degradation definition: p95 > 500ms OR non-409 error rate > 1% OR throughput stops increasing vs previous level.

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

# After the warm-up, start sampling immediately before the measured run.
# Sampling runs in the background, so the shell remains available.
(
  while kill -0 "$api_pid" 2>/dev/null; do
    ps -o pid=,pcpu=,rss= -p "$api_pid"
    sleep 2
  done
) > api-stats.log &
stats_pid=$!

# After testing, stop the sampler and API
kill "$stats_pid" "$api_pid" 2>/dev/null || true
wait "$stats_pid" "$api_pid" 2>/dev/null || true
```

Record peak CPU% and RSS for both during the measured 60-second invocation only; exclude the warm-up samples.

## Done when
Results table (VUs / req/s / p50 / p95 / p99 / error% / API RSS / PG CPU) filled in for all 5 levels and the capacity ceiling is identified.
