# Synk agent accuracy report

- Model: `google_genai:gemini-3.5-flash-lite`
- Run: 2026-11-15 07:53 UTC
- Accuracy: **30/30 (100%)**, target 90%

| Category | Passed |
| --- | --- |
| happy | 15/15 |
| ambiguity | 5/5 |
| denial | 5/5 |
| edge | 5/5 |

| Case | Category | Result | Notes |
| --- | --- | --- | --- |
| `create-basic` | happy | pass | - |
| `create-assign-me` | happy | pass | - |
| `create-due-date` | happy | pass | - |
| `create-sprint-priority` | happy | pass | - |
| `create-status` | happy | pass | - |
| `update-status` | happy | pass | - |
| `update-priority` | happy | pass | - |
| `update-assign` | happy | pass | - |
| `update-unassign` | happy | pass | - |
| `update-by-description` | happy | pass | - |
| `find-mine` | happy | pass | - |
| `search-topic` | happy | pass | - |
| `search-discussion` | happy | pass | - |
| `doc-with-notes` | happy | pass | - |
| `doc-under-parent` | happy | pass | - |
| `ambiguous-assignee-update` | ambiguity | pass | - |
| `ambiguous-assignee-create` | ambiguity | pass | - |
| `ambiguous-surname` | ambiguity | pass | - |
| `ambiguous-ticket` | ambiguity | pass | - |
| `ambiguous-parent` | ambiguity | pass | - |
| `denied-secret-ticket` | denial | pass | - |
| `denied-view-only-create` | denial | pass | - |
| `denied-view-only-update` | denial | pass | - |
| `denied-secret-doc` | denial | pass | - |
| `denied-no-tool` | denial | pass | - |
| `edge-missing-ticket` | edge | pass | - |
| `edge-no-title` | edge | pass | - |
| `edge-already-done` | edge | pass | - |
| `edge-off-topic` | edge | pass | - |
| `edge-relative-date` | edge | pass | - |
