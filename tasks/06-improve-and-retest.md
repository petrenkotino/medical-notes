# Task 06: Load Test (Stepped Baseline)

Run a capacity-finding load test with default settings. Let results identify the bottleneck.

## k6 script design
- Scenario mix: 70% GET, 20% POST, 10% PUT
- Pre-seed ~50 notes in `setup()` for GET/PUT targets
- Per-endpoint tagging (`{ tags: { endpoint: 'get' } }`) for latency/error breakdown
- Correctness checks via k6 `check()` on status and response body shape
- 409s on PUT are expected — tracked separately, excluded from infrastructure error rate

## Load levels and stage structure
Run k6 once per load level (not one long stepped run) so each produces a clean independent summary:

```bash
k6 run --env VUS=10  --env DURATION=60s load-tests/k6.js
k6 run --env VUS=25  --env DURATION=60s load-tests/k6.js
k6 run --env VUS=50  --env DURATION=60s load-tests/k6.js
k6 run --env VUS=100 --env DURATION=60s load-tests/k6.js
k6 run --env VUS=200 --env DURATION=60s load-tests/k6.js
```

Each run: 15s ramp-up → 45s steady-state hold.

Warm-up strategy — run a separate unreported warm-up invocation first, then the measured run:
```bash
# Warm up (results discarded)
k6 run --env VUS=10 --env DURATION=15s load-tests/k6.js > /dev/null 2>&1
# Measured run
k6 run --env VUS=10 --env DURATION=60s load-tests/k6.js
```
This ensures JIT compilation, connection pool fill, and OS TCP buffers are at steady state before measurement begins. Apply the same pattern for each VU level.

Degradation definition: p95 > 500ms OR non-409 error rate > 1% OR throughput stops increasing vs previous level.

## Files to create
- `load-tests/k6.js` — parameterised by `VUS` and `DURATION` env vars

## Resource measurement
Terminal 1 — PostgreSQL (Docker):
```bash
docker stats medical-notes-postgres-1 --format "table {{.CPUPerc}}\t{{.MemUsage}}"
```

Terminal 2 — API process (native):
```bash
# Start the API, capture its PID directly — no pgrep needed
node dist/index.js &
api_pid=$!

# Sample every 2s during the test
while true; do ps -o pid=,pcpu=,rss= -p $api_pid 2>/dev/null || break; sleep 2; done

# After testing, stop the server
kill $api_pid
```

Record peak CPU% and RSS for both during the steady-state window.

## Done when
Results table (VUs / req/s / p50 / p95 / p99 / error% / API RSS / PG CPU) filled in for all 5 levels and the capacity ceiling is identified.
