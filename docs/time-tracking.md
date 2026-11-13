# Time tracking

This covers PRD section 6.8 and journey 9.

## Requirement coverage

| Requirement | Implementation |
| --- | --- |
| FR-TT1 | Start a timer on a ticket from the Time page or from the ticket itself, and stop it. Each person has at most one running timer: starting another stops the first, even when two starts happen at once. |
| FR-TT2 | Add time worked earlier with a date, start and end time and an optional note. Entries must end after they start, last at most 24 hours and not be in the future. |
| FR-TT3 | A weekly view shows hours per day, totals by ticket and by person, and every entry, for everyone or just yourself. The week exports as CSV. |
