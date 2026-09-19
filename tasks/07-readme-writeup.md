# Task 07: Improve + Retest

Identify one bottleneck from Task 06 results, implement a concrete fix, rerun the identical test.

## Process
1. Pick the bottleneck most clearly supported by the data (latency spike, throughput plateau, error pattern, CPU/memory)
2. Implement the smallest change that addresses it
3. Reset DB to identical starting state (reseed same notes)
4. Rerun the exact same k6 script
5. Record before/after side by side at each VU step

## Done when
Before/after comparison is documented with the bottleneck clearly justified by Task 06 evidence.
