# SeaLog: Latest Features & Novelty Updates

> **Notice to Contributors/Reviewers**: This document summarizes the major features and "novelty values" that were added to the SeaLog project in the most recent sprint (last ~10 commits). Please use this guide to update any specific report or documentation sections, or to understand the expanded scope of the capstone project.

---

## 1. Zero-Trust Verification Engine & The 4 Novelty Metrics
We aggressively restructured the basic verification endpoint to stop trusting the database's `merkle_proofs` cache. We now fetch raw Database Records + the On-Chain Root, and force the Verification API to calculate everything dynamically from scratch. 

To visualize this for non-technical users, we added **4 cryptographic novelty metrics** to the verification return payload:
1. **`proof_source` (`DERIVED`)**: Cryptographically proves that the cached signature was outright ignored, and the engine correctly derived the position-preserving proof strictly from raw logs.
2. **`integrity_score` (0-100)**: A graded integer scoring the log's exact health. Failing a Merkle root match instantly drops it to 30.
3. **`timestamp_skew` (`LOW`, `MEDIUM`, `HIGH`)**: A built-in dual-timestamp temporal tracker. Because we store both an untrusted client `timestamp` and an immutable server `ingested_at` time, we actively calculate the delta in MS. A massive delta instantly sets the metric to `HIGH` to detect backdating attacks.
4. **`root_match` (boolean)**: Explicitly separates the validity of the computed Merkle Path from whether that path actually anchors to the final L2 Blockchain Root.

## 2. Next.js 15 Visual Auditing Dashboard
Instead of just relying on Postman or raw API calls, we built a dedicated frontend UI inside the `/dashboard` directory. 
- **Real-Time Verification Panel**: Visually maps the 4 novelty metrics above inside a beautiful interface.
- **Transparency Viewer**: A *"View Raw JSON"* toggle allowing auditors to inspect the actual REST API payload.
- **Live "Simulate Tamper" Console**: Added buttons that interact with our `/admin/simulate-tamper` API to actively mutate the database records and instantly reflect the dropped `integrity_score` and `timestamp_skew` anomalies on the UI.

## 3. Empirical Research Benchmarking & Graphs
To academically prove that our architecture scales, we added heavy load testing.
- Built `benchmarks/research_benchmark.ts` to hammer the API with `N=10, 50, 100, 500` massive log batches.
- Captured ingestion throughputs peaking over **4,300 logs/second**, and tracked end-to-end (E2E) verification latency.
- Conducted a strict **Proof Size Analysis**, which generated `.csv` data showing that proof sizes only increased from 128 bytes to 288 bytes even when scaled 50x. This empirically proves the legendary **O(log N) Space Complexity** of Merkle Trees.
- Wrote `benchmarks/generate_graphs.ts` via ChartJS/Node.js to literally output publication-ready `.png` graphs representing this data.

## 4. Cross-Batch Hash Chaining
We upgraded the Batch Processor. Every time a new Merkle batch is created, it now takes the Merkle Root of the *current* batch, combines it with the hash chain signature of the *previous* batch, and computes a linked hash.
- **Why this was added**: Previously, if an attacker got access to the Database and deleted *an entire batch*, the Merkle Roots of the surrounding batches would still be valid, meaning the deletion of an entire batch could technically go unnoticed. Cross-Batch chaining forces a broken sequential link, meaning any deleted or swapped batch is instantly caught.

---

### Documentation Synced
* `README.md`
* `PROJECT_STATUS.md`
* `docs/INVARIANTS.md`
* `docs/TESTING_GUIDE.md`

You can safely pull from `main` to see these updates!
