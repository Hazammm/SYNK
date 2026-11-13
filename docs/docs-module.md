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
