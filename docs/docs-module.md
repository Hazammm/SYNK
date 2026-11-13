# Docs

This covers PRD section 6.5 and the two agent tools from Sprint 6, `create_doc` and `search_workspace`.

## Requirement coverage

| Requirement | Implementation |
| --- | --- |
| FR-D1 | Pages belong to a project and can have subpages. The sidebar shows the tree. Pages can be moved to another parent, but never inside themselves. |
| FR-D2 | Pages are written in Markdown: headings, bulleted and numbered lists, checklists, links, code blocks, quotes, bold, italic and inline code. A toolbar inserts the syntax, and the preview renders it. Checklist items can be ticked in the preview. |
| FR-D3 | Each page records who created it, who last edited it and when. |
| FR-D4 | Full-text search across titles and content in every project the reader can open. Title matches rank first, and partial words still match. |
| FR-AI2 | `create_doc` and `search_workspace` complete the four agent tools in the PRD. |

## Access

Pages follow project access, through the same `can()` check as tickets:

| Project level | Can do |
| --- | --- |
| No access | Nothing. A page in the project looks the same as one that does not exist. |
| `READ` | Read pages and search them. |
| `WRITE` | Also create, edit, move and delete pages. |

## Design decisions

- **Markdown, not HTML.** Content is stored as Markdown and parsed into data that React renders, so a page can never inject markup or scripts. Only `http`, `https`, `mailto` and same-site links become links; anything else, such as `javascript:`, stays as plain text.
- **No lost edits.** Every save sends the version the editor started from. If someone else saved in the meantime, the save is refused with their name, instead of silently overwriting their work.
- **Deleting is recursive.** Deleting a page deletes its subpages, and the confirmation says how many.
- **Search without extra infrastructure.** PostgreSQL's built-in full-text search ranks results, with a title weight and a substring fallback for partial words. There is no search index yet, which is fine at FYP scale; a GIN index can be added later if pages grow into the thousands.

## Agent tools

| Tool | Changes data | Notes |
| --- | --- | --- |
| `create_doc` | Yes, no confirmation | Creates new data only. The parent page is given by title, and unclear titles get a clarifying question. |
| `search_workspace` | No | Returns tickets in projects the person can open, pages in those projects, and messages from channels they have joined. |

The assistant also receives each project's recent page titles, so it can file a new page under the right parent.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET, POST | `/api/projects/:id/docs` | List pages (without content), or create one |
| GET, PATCH, DELETE | `/api/docs/:id` | Read, update or delete a page. PATCH needs `version`. |
| GET | `/api/workspaces/:id/docs/search?query=…` | Search pages |

## Tests

- `tests/unit.test.ts`: the Markdown parser and its link safety, toolbar edits, permissions and schemas.
- `tests/docs.integration.test.mts`: nesting, access, edit conflicts, moves, recursive deletes and search ranking and visibility.
- `tests/agent.integration.test.mts`: `create_doc` and `search_workspace`, including private-channel messages staying hidden.
- `tests/e2e/docs.spec.ts`: writing, formatting, subpages, ticking a checklist item, search and reload in a browser.
