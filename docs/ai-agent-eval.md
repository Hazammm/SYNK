# Agent accuracy evaluation

PRD section 18.3 asks for 30 prompts with expected tool calls, and FR-AI2 sets a target of at least 90% accuracy. This folder holds that test set and the tool that runs it.

## What it measures

`agent/evals/cases.json` has the 30 prompts in the PRD's categories:

| Category | Count | Example |
| --- | --- | --- |
| Happy path | 15 | "Create a high priority ticket called Fix login bug" |
| Ambiguity | 5 | "Assign SYN-12 to Sarah", with two Sarahs on the project |
| Permission denial | 5 | "Create a ticket called Budget review in the Secret project" |
| Edge cases | 5 | "Update SYN-999 to Done", "Create a ticket" with no title |

Each prompt runs in a fresh conversation through the real agent graph and the real model. Tool calls go to a rules-based stand-in for Synk (`agent/evals/workspace.py`). It resolves names and refuses view-only or hidden projects the same way the real tools do, so the run measures the model's decisions without a database.

A prompt passes when every expectation holds: the right tool with the right arguments, a confirmation for updates, a clarifying question naming the options, or a refusal that changes nothing.

## Running it

```bash
npm run agent:eval
```

The report is written to `agent/evals/results/` (`report.md` and `results.json`). The command fails when accuracy is below 90% or a prompt could not be scored. To try another model, set `LLM_MODEL` for the run.

Rate limits are not counted against the model: a prompt that hits one is retried after 30, 60 and 90 seconds, and is reported as "not scored" if it still cannot run.

## Results so far

| Run | Model | Scored | Passed | Accuracy |
| --- | --- | --- | --- | --- |
| 13 Nov 2026 | `gemini-3.5-flash` | 3 | 3 | Stopped: the free tier allows 20 requests a day for this key, and a full run needs about 60 |
| 13 Nov 2026 | `gemini-3.5-flash-lite` | 25 | 23 | 92%. Stopped on request before the last 5 edge cases |

By category on the Flash Lite run: happy path 14/15, ambiguity 4/5, denial 5/5. The edge cases were not reached.

The two failures:

- **`update-assign`** ("Assign SYN-20 to Bilal"): the model did not call `update_ticket` with Bilal as the assignee.
- **`ambiguous-parent`** ("Add a page called Retro notes under the brief"): the model picked one of the two "brief" pages and created the page instead of asking which one.

Both point to prompt rules worth tightening: always pass names exactly as the user gave them, and never choose between similarly named pages.

## Limits

- The free Gemini tiers cap daily requests, so a full run may need a fresh day's quota, or a model with a larger limit.
- Model answers vary between runs, so treat a single run's score as an estimate.
