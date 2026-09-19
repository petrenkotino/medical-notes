# Task 08: README + Write-Up

Final README covering all submission requirements.

## Sections to add/update
1. Prerequisites (Docker, Node 24, pnpm, k6)
2. How to start the service
3. How to call the API (curl examples, already partially done)
4. Load test: how to reproduce baseline and improved runs
5. Results: stepped throughput/latency table, before/after comparison
6. Write-up:
   - Capacity ceiling observed (VU level where degradation began)
   - Key stats from both runs
   - Next 3-5 improvements — justified by what the results actually showed, not generic suggestions
   - Note on audit logging: best-effort, not transactionally guaranteed
   - Note on timestamp semantics: each version's `created_at` is the authoritative revision timestamp

## Done when
Someone can clone the repo, follow the README, and reproduce the results independently.
