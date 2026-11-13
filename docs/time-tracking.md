# Time tracking

This covers PRD section 6.8 and journey 9.

## Requirement coverage

| Requirement | Implementation |
| --- | --- |
| FR-TT1 | Start a timer on a ticket from the Time page or from the ticket itself, and stop it. Each person has at most one running timer: starting another stops the first, even when two starts happen at once. |
| FR-TT2 | Add time worked earlier with a date, start and end time and an optional note. Entries must end after they start, last at most 24 hours and not be in the future. |
| FR-TT3 | A weekly view shows hours per day, totals by ticket and by person, and every entry, for everyone or just yourself. The week exports as CSV. |

## Access

| Project level | Can do |
| --- | --- |
| No access | Nothing. A ticket in the project looks the same as one that does not exist. |
| `READ` | See everyone's time in the project. |
| `WRITE` | Also start timers and add time on the project's tickets. |

People can delete only their own entries. Deleting a ticket deletes the time logged on it.

## Design decisions

- **Server time for timers.** Start and stop times come from the server clock, so a wrong computer clock cannot change how long a timer ran.
- **A 24-hour limit.** A timer left running overnight stops counting at 24 hours, and manual entries longer than that are refused, so one forgotten timer cannot distort a report.
- **Weeks in local time.** Weeks start on Monday at midnight in the reader's own time zone, and each entry counts on the day it started.
- **One running timer per person.** Enforced by locking the person's row while a timer starts, rather than a database constraint that the schema tooling would not track.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/time-entries/start` | Start a timer on a ticket; stops a running one first |
| POST | `/api/time-entries/stop` | Stop the running timer |
| GET | `/api/time-entries/active` | The caller's running timer, if any |
| GET, POST | `/api/time-entries` | List a project's entries in a range, or add one by hand |
| DELETE | `/api/time-entries/:id` | Delete one of your own entries |
