# Audit delta: V2 (e2bd944, 78 items) → V4 (05eeaca, 102 rows)

All counts come from PRIORITISED_BACKLOG.csv and reconcile: 78 V2 items + 24 new = 102 rows; 20 verified-fixed; 82 active.

| Change | Count | Items |
|---|---|---|
| **Closed** (verified-fixed in code + tests) | 20 | BUG-011, SEC-006, SEC-007, QA-003, BUG-015, OPS-002, UX-003, OPS-001, BUG-006, OPS-006, GEO-004, UX-004, QA-006, SEC-008, OPS-007, SEC-002, FEAT-005, DEBT-001, SEC-012, PERF-004 |
| **Implemented, device check owed** | 12 | BUG-010, BUG-001, BUG-012, A11Y-006, BUG-013, UX-010, UX-001, UX-009, UX-005, BUG-014, PRIV-001, UX-007 |
| **Partial** | 8 | QA-001, SEC-011, SEC-005, QA-002, DEBT-002, DOC-003, A11Y-002, DEBT-006 |
| **Still open** | 26 | QA-004, A11Y-001, BUG-008, BUG-009, UX-002, A11Y-003, GEO-001, BUG-007, GEO-002, PERF-001, GEO-003, A11Y-004, DEBT-003, DOC-002, UX-006, A11Y-005, OPS-008, GEO-007, DEBT-007, GEO-006, QA-005, UX-011, PRIV-003, PERF-003, UX-008, FEAT-001 |
| **Owner checks** | 4 | SEC-013, OPS-005, DEBT-005, DEBT-009 |
| **Blocked** | 1 | FEAT-007 |
| **Proposals (unchanged)** | 7 | FEAT-003, FEAT-006, PRIV-002, FEAT-002, FEAT-004, I18N-001, FEAT-008 |
| **Obsolete** | 0 | – |
| **Regressed / worsened** | 3 (subset of the rows above) | DOC-003 (plan stale again), A11Y-005 (chips now 36 px high after #18), V4-REL-01 (road-use labels removed before LG passed) |
| **New** | 24 | P0: V4-REL-01 · P1: V4-POI-08, V4-POI-01, V4-POI-03, V4-MAP-01, V4-MAP-02, V4-MAP-03, V4-MAP-04, V4-NAV-01, V4-REL-03, V4-REL-04 · P2: V4-MAP-05, V4-POI-02, V4-POI-04, V4-POI-05, V4-POI-06, V4-POI-07, V4-FEAT-01, V4-FEAT-02 · P3: V4-PRIV-04, V4-OPS-09, V4-FEAT-03, V4-FEAT-04, V4-FEAT-05 |

Active by priority: P0 2, P1 18, P2 30, P3 32 (82).

Seed V4-REL-02 was merged into DEBT-005 (same issue), so it has no row of its own.

## What moved most
- WS-A to WS-F did what they claimed: the items they targeted are fixed in code, and what is left of them is mostly device or owner evidence (QA-002 hook tests and the SEC-011 budget residual are the code exceptions).
- The new risk is concentrated in three new areas: live-by-default navigation, live places and the 3D map. 23 of the 24 new rows are in those areas or release hygiene.
- Test count 475 (V2 baseline) → 647; the 3D page and the hooks are still the least tested code.
