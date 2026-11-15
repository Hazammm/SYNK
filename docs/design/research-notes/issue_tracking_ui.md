# Issue-tracking and project-management UI/UX (Linear, Height, Jira, Plane, Shortcut, GitHub Projects) — state as of Nov 2026

**Read this first — source access caveat.** In this session every direct page fetch failed (linear.app, atlassian.design, plushcap.com, buildmvpfast.com all unresolvable from the sandbox network). Everything below therefore comes from **web-search result snippets and search-engine summaries of the cited pages**, not from reading the pages in full. Wording in quotation marks is as the search summary rendered it and may not be verbatim from the page. No Dribbble, Behance, Mobbin, Refero or Awwwards pages were reached or surfaced. Numeric values for Linear (px sizes, heights) come from third-party "extracted design system" files, not from Linear; they conflict with each other in places and are marked as such. Anything I could not source is in Gaps, including items I recall from prior knowledge, which are labelled "unverified recall".

## 1. How do Linear and its peers structure the app shell (sidebar, sections, workspace switcher, top bar, command palette)?

### Takeaway
The 2025-26 direction across all vendors is a left sidebar that visually recedes (dimmed, lower-contrast, collapsible, user-customisable) with project-level features moved into tabs inside the content area and search/inbox either in the sidebar or a fixed top bar. Jira's switch from top-bar to sidebar navigation is the cautionary case: forced rollout, more clicks, poor behaviour on laptop widths.

### Cited Findings
**Linear**
- Linear shipped a "UI refresh" on 12 March 2026, described as a calmer, more consistent interface intended to make information easier to scan and navigation between workflows smoother — [Linear changelog 2026-03-12](https://linear.app/changelog/2026-03-12-ui-refresh)
- Linear's companion post on that refresh describes the sidebar before/after as: smaller icons, muted inactive text, more vertical padding. It states a principle that elements should not "compete for attention"; icons are used so projects, issues, initiatives and statuses are recognisable at a glance, but had become excessive in some views and were reduced — [Linear, Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)
- Third-party analysis of the same refresh: sidebar "muted several notches", inactive item text lower contrast, tab bar shrunk and given rounded corners, separator contrast reduced, default palette moved to a warmer, less saturated grey — [deeplangai feed, "Linear dimmed its sidebar and called it a design principle"](https://grain-8opupt1uu-deeplangai.vercel.app/feed/OVMC4GyElMX) (secondary source; not verified against Linear's text)
- June 2026: hover-state changes on sidebar nav items were made instant (no transition) — [Linear changelog 2026-06-04](https://linear.app/changelog/2026-06-04-team-documents)
- The earlier (2024, older) redesign targeted sidebar, tabs, headers and panels with the aim of reducing visual noise — [Linear, How we redesigned the Linear UI (part II)](https://linear.app/now/how-we-redesigned-the-linear-ui); changelog entry [2024-03-20 New Linear UI](https://linear.app/changelog/2024-03-20-new-linear-ui)
- Linear mobile got a redesign (Oct 2025) and customisable navigation (Jan 2026) — [changelog 2025-10-16](https://linear.app/changelog/2025-10-16-mobile-app-redesign), [changelog 2026-01-22](https://linear.app/changelog/2026-01-22-customize-your-navigation-in-linear-mobile)
- Third-party extraction: sidebar items 13px text with 6px vertical padding; keyboard-shortcut hints in the sidebar in an 11px monospace label; buttons/inputs 13px text at 28px height — [oh-my-opencode linear.app design reference](https://cdn.jsdelivr.net/npm/oh-my-opencode@4.18.2/dist/skills/frontend/references/design/linear.app.md) / [hagicode design detail](https://design.hagicode.com/designs/linear.app/) (unofficial, machine-extracted; the search summary did not say which of the two files each figure came from)

**Jira (new navigation)**
- Atlassian replaced top-bar navigation with a sidebar in a phased rollout during 2025 (admin-controlled at first, always-on in phase three) — [Atlassian Community, The new navigation: coming to you in 2025](https://community.atlassian.com/forums/Navigation-Refresh-articles/The-new-navigation-Coming-to-you-in-2025/bc-p/3001027)
- A full-height sidebar followed, rolling out across Atlassian apps in December 2025 for discoverability; the collapse shortcut changed from `[` to `Ctrl+[`, which users objected to; sites with custom branding were held back — [Atlassian Community, A full-height sidebar for better navigation](https://community.atlassian.com/forums/Navigation-Refresh-articles/A-full-height-sidebar-for-better-navigation/ba-p/3144347)
- An Atlassian engineer justified the reversal of the 2020 top-nav direction as being "1-and-a-half design generations ago" and cited easier project switching — [Atlassian Community, Ask an engineer](https://tnckb94959.lithium.com/forums/Navigation-Refresh-discussions/Ask-an-engineer-Behind-the-scenes-of-the-new-navigation/m-p/3010672)

**Plane**
- "Navigation 2.0" (Dec 2025): workspace search and inbox moved to a top bar that stays fixed across projects; sidebar collapsible and customisable; project features (Cycles, Modules, etc.) shown as horizontal or vertical tabs inside the project — [Plane blog, Introducing Plane navigation 2.0](https://plane.so/blog/introducing-plane-navigation-2); [Plane changelog 2025-12-01](https://plane.so/changelog/2025-12-01-workspace-navigation-custom-forms-threads)
- v2.3.0: sidebar adapts to screen size, spacing revised, compact inbox mode with peek-on-hover — [Plane changelog v2.3.0](https://plane.so/changelog/release-v2-3-0-simplified-settings-compact-inbox-faster-workflows)
- July 2026: favourite actions in the sidebar favourites menu — [Plane changelog 2026-07-15](https://plane.so/changelog/2026-07-15-shared-dashboards-bitbucket-integration-open-weight-ai)
- Plane has a "Power K" command menu with shortcuts (Oct 2025) — [Plane changelog 2025-10-31](https://plane.so/changelog/2025-10-31-power-k-shortcuts-empty-states-pages)

**Shortcut**
- Redesign began with an early-2025 rebrand and shipped iteratively: app header and navigation first, then page layouts, then features (story creation, kanban boards, backlogs, roadmap). Refinements included spacing, icon swaps, navigation motion and transition speeds. Colour was the most debated part — [Shortcut blog, Designing a calmer, clearer, faster Shortcut (Nov 2025)](https://shortcut.com/blog/designing-a-calmer-clearer-faster-shortcut)
- Earlier (older) layout change: left-nav features grouped; upper-right items moved into a slide-out shelf; dog-fooded internally for a few weeks first — [Shortcut blog, A quick look at our new layout and navigation](https://www.shortcut.com/blog/a-quick-look-at-our-new-layout-and-navigation/)

**Height**
- Height announced it would cease operations on 24 September 2025, after about 3.5 years of public availability; it is not a live reference product in 2026 — [AlternativeTo news](https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/)

**Command palette / keyboard (Linear)**
- `Cmd/Ctrl+K` opens the command menu; with issues selected it scopes to actions on the selection, and it handles bulk property updates. Right-click gives an equivalent contextual menu — [Linear docs, Select issues](https://linear.app/docs/select-issues); [Linear docs, Issues](https://linear.app/docs/creating-issues)
- Single-key property shortcuts exist (e.g. `I` assigns to self; "Assign to..." via the command menu) — [Linear docs, Assign and delegate issues](https://linear.app/docs/assigning-issues)
- `?` searches shortcuts; a "keyboard" mode reachable from the command menu disables pointer input for shortcut practice — [Linear docs, Markdown editor](https://linear.app/docs/markdown-editor); [Linear changelog](https://linear.app/changelog/page/8)
- On boards, `Escape` or click-away deactivates the focused card so `Cmd/Ctrl+K` returns to global context — [Linear changelog](https://linear.app/changelog/page/8)
- Linear wrote up the engineering of its contextual menus (older) — [Linear, Invisible details](https://linear.app/now/invisible-details)

### Inferences
- The command palette is context-sensitive, not just a search box: scope follows focus/selection (global, focused item, multi-selection). A design needs an explicit "focused item" concept and a way to drop it (Escape).
- Three interchangeable routes to every action (single-key shortcut, command menu, right-click menu) is the pattern, with shortcut hints shown inline in menus.
- Sidebar hierarchy in 2026 is carried by contrast between active and inactive items rather than by colour or icon weight; instant hover feedback is preferred over eased transitions for nav.
- Jira and Plane diverge on search/inbox placement (sidebar vs fixed top bar); both keep project sub-features as tabs in the content area rather than deep sidebar nesting.

### Gaps
- Exact sidebar widths (px) for any product: not found in any source reached.
- Workspace-switcher anatomy for any product: not found.
- Linear's sidebar section list (Inbox, My Issues, Teams, etc.) and Space-to-peek shortcut: unverified recall, not surfaced by searches.
- Height's UI details (command palette, layout): no source found; product defunct.
- Jira's sidebar section order and "Spaces" renaming: not confirmed from sources reached.

## 2. What does a best-in-class kanban card and backlog row contain, and how is hierarchy achieved at high density?

### Takeaway
Sourced detail here is thin. What is documented: dense 13px text with ~28px controls and ~6px row padding (third-party measurements of Linear), hierarchy by opacity/contrast steps instead of colour, a single consistent pill style for row properties (Plane), and user-configurable card fields (GitHub Projects).

### Cited Findings
- Third-party teardown frames Linear's look as near-black tokens, 13px density and a Cmd+K palette; its CSS sets body 13px / line-height 1.45 and compact list/table rows at about 6px vertical padding, and calls density a power-user optimisation — [buildmvpfast, The Linear Aesthetic, Decoded (2026)](https://www.buildmvpfast.com/blog/linear-aesthetic-tokens-density-keyboard-first-ux-2026) (author's reconstruction, not Linear's published spec)
- Machine-extracted Linear design files list: typeface Inter Variable (fallbacks SF Pro Display, system fonts); a 13px caption tier for metadata/timestamps at line-height 1.50 with slightly negative letter-spacing; 4px spacing grid; semantic colour tokens — [oh-my-opencode linear.app reference](https://cdn.jsdelivr.net/npm/oh-my-opencode@4.18.2/dist/skills/frontend/references/design/linear.app.md); [linear-ui-skills](https://skillselion.com/skills/ihlamury/design-skills/linear-ui-skills)
- Conflict: one extraction gives body text as 14px, weight 510, line-height 21px; another gives body-small 13px weight 400 — [designlang Linear design language](https://designlang.vercel.app/gallery/linear-app/linear-app-design-language.md) vs [webdesignhot Linear design.md](https://www.webdesignhot.com/design.md/linear/) (which file holds which figure was not resolved by the search summary; these may describe the marketing site rather than the app)
- One design-system write-up says information density in Linear is managed through gradations of white opacity rather than colour variation — [hagicode design detail](https://design.hagicode.com/designs/linear.app/) (unofficial)
- Plane (30 Sep 2026): work item rows made clearer with one pill style for all properties — [Plane changelog 2026-09-30](https://plane.so/changelog/2026-09-30-plane-agents-propel-new-ai-models)
- GitHub Projects board: when the board is grouped by a field other than status, the status value can be shown as metadata on the card; a "slice" side panel filters the view by a field value, respects the active filter, has a field switcher at the top, and cannot slice by title, reviewers or linked PRs — [GitHub Docs, Customizing the board layout](https://docs.github.com/en/issues/planning-and-tracking-with-projects/customizing-views-in-your-project/customizing-the-board-layout); [GitHub changelog, issues label](https://github.blog/changelog/label/issues/page/2)
- Jira lets admins customise which fields appear on board cards — [Atlassian Learning, Customize card layouts for a Jira board](https://community.atlassian.com/learning/lesson/jira-customize-card-layout)
- Linear's 2026 refresh reduced icon size and presence because icons were competing with content — [Linear, Behind the latest design refresh](https://linear.app/now/behind-the-latest-design-refresh)

### Inferences
- Consistent third-party figure set for a dense tracker: 13px base text, 28px control height, ~6px vertical row padding, 4px grid. Treat as approximate.
- Row hierarchy pattern: one primary-contrast element (title), everything else stepped down in opacity; properties rendered in one uniform chip/pill style so they read as a single metadata band.
- Card fields should be user-toggleable per view, and the grouping field should be dropped from the card while the displaced field (e.g. status) is promoted onto it.

### Gaps
- Exact Linear card/row anatomy (ID, title, priority icon, status icon, labels, assignee avatar, estimate, cycle, due date order): unverified recall only; no source reached.
- Board column widths, card radii, card padding, row heights in px for any product: not found.
- Status/priority iconography specs (Linear's progress-ring status icons and bar-style priority icons; Jira's coloured lozenges and arrow priorities): unverified recall; no source reached.
- Empty and loading states for boards/lists: no sources found beyond Plane mentioning new empty states in [changelog 2025-10-31](https://plane.so/changelog/2025-10-31-power-k-shortcuts-empty-states-pages) (no detail in snippet).
- Motion specifics (durations, easings, drag-and-drop behaviour): none found, other than Linear making sidebar hover instant and Shortcut tuning nav transition speeds (both cited in section 1).

## 3. How are ticket details presented (side drawer vs full page, properties panel, activity feed)?

### Takeaway
Plane is the only vendor with a retrievable 2026 write-up: it supports both a peek view and a full detail page, and its redesign promotes key properties into the main column, separates read-only reference data from editable fields, and splits activity into tabs.

### Cited Findings
- Plane's redesigned work item detail page rests on four moves: group related items, promote key properties, collapse what can wait, resurface hidden content. Key properties moved to the centre column — [Plane blog, Meet the new work item detail page](https://plane.so/blog/meet-the-new-work-item-detail-page)
- Activity area split into five tabs: All, Comments, History, Transitions, Worklogs. History shows old and new value per property change. Long descriptions truncate with "show more". Action buttons consolidated into icon groups — [Plane forum, The work item detail page, redesigned](https://forum.plane.so/t/the-work-item-detail-page-redesigned/106)
- Rationale: "created by" had sat among editable properties; it was moved because it is reference information, not something users edit — [Plane blog, New work-item detail view, custom relations and more](https://plane.so/blog/new-work-item-detail-view-custom-relations-and-more)
- Follow-up fixes: activity feed no longer scrolls to top on tab switch; overflow activity tabs collapse into a "More" menu; closing an editor menu in a description no longer closes the page peek view — [Plane changelog 2026-09-30](https://plane.so/changelog/2026-09-30-plane-agents-propel-new-ai-models); [Plane changelog index](https://plane.so/changelog?category=self-hosted)
- Plane's list, peek view, create dialog and command menu share the same Propel components — [Plane blog, Introducing Propel](https://plane.so/blog/propel-plane-design-system)
- Linear (March 2026) made commenting lighter, with a preference for sending with Enter or Ctrl+Enter — [Linear changelog mirror 2026-03-12](https://linear-web.pages.dev/changelog/2026-03-12-ui-refresh) (mirror domain, not linear.app; treat with caution)
- GitHub Projects uses a right-hand side panel, including for project description/README — [GitHub changelog, issues label](https://github.blog/changelog/label/issues/page/2)
- Shortcut published a rationale for redesigning its Story view (older, Clubhouse era) — [Shortcut blog, Why we redesigned the Story view](https://www.shortcut.com/blog/why-we-redesigned-the-story-view-769a3d02d27e/) (content not retrieved)

### Inferences
- Peek/drawer and full page should be the same component at two widths, so behaviour and shortcuts are identical.
- Layered dismissal matters: Escape must close the innermost layer (menu) before the drawer; Plane shipped a bug here.
- Separate editable properties from read-only metadata (creator, created/updated dates) visually and spatially.
- Activity filtering by type (comments vs field history) is now expected; preserve scroll position when switching.

### Gaps
- Linear issue page layout (main column + right properties sidebar, activity below description) and Jira issue view layout: unverified recall; no source reached.
- Drawer widths, breakpoints, and whether drawers overlay or push content: not found for any product.
- GitHub's new issue page / sub-issues UI specifics: search did not surface them.

## 4. How are sprint/cycle reports and burndown charts presented?

### Takeaway
Linear documents a burn-up style cycle graph with four encodings (grey scope, blue completed, yellow started stacked on completed, dotted blue target that flattens over weekends). Jira's classic burndown uses a red remaining line against a grey guideline plus a scope-change log. Shortcut offers a count/points toggle and freezes the chart at iteration end.

### Cited Findings
**Linear cycle graph**
- Grey line = scope (total work in cycle); solid blue line = completed; blue bars also represent completed issues; yellow line = started issues, stacked on the completed line so the combined height shows all active work — [Linear docs, Cycle graph](https://linear.app/docs/cycle-graph)
- Blue dotted target line = even spread of the cycle's total estimate across remaining days, flat across weekends; completed tracking above target means on pace — [Linear docs, Cycle graph](https://linear.app/docs/cycle-graph)
- Units: estimate points (including team default estimate for unestimated issues) or issue count if estimates are off — [Linear docs, Cycle graph](https://linear.app/docs/cycle-graph)
- Projects have an equivalent graph; cycle capacity and graph improvements date from 2022 (older) — [Linear docs, Project graph](https://linear.app/docs/project-graph); [Linear changelog 2022-09-22](https://linear.app/changelog/2022-09-22-cycles-and-graph-improvements)

**Jira**
- Sprint burndown shows completed work against total remaining work; a grey line shows the ideal rate; a scope-changes log lists items added, removed or re-estimated mid-sprint — [Atlassian Support, What is the sprint burndown report?](https://support.atlassian.com/jira-software-cloud/docs/what-is-the-sprint-burndown-report/); [Atlassian Support, View and understand the burndown chart](https://support.atlassian.com/jira-software-cloud/docs/view-and-understand-the-burndown-chart/)
- Remaining work is drawn as a red line against the grey guideline (third-party description) — [Atlassian agile tutorial, burndown charts](https://www.atlassian.com/agile/tutorials/burndown-charts)
- Burnup chart: red line for planned scope, green line for work done; rising scope line signals scope creep — [Atlassian docs, Burnup chart](https://confluence.atlassian.com/display/JIRASOFTWARECLOUD/Burnup+Chart)

**Shortcut**
- Burndowns exist for Iterations, Milestones and Labels; default metric is story count or points depending on estimate-scale settings, with a toggle; iteration burndown "freezes" after its end date — [Shortcut help, Burndown Chart](https://www.shortcut.com/help/reports/burndown-chart)
- Solid line for unfinished work, dotted line for the ideal linear path — [Shortcut blog, Burndown chart: are we on track?](https://www.shortcut.com/blog/burndown-chart-are-we-on-track/)

**Third-party**
- Screenful sells automated sprint/cycle report templates for Jira and Linear, showing amount planned vs completed so far — [Screenful](https://screenful.com/product-news/introducing-sprint-reports-for-jira-and-linear)

### Inferences
- Two conventions coexist: burn-down (remaining falls toward zero; Jira, Shortcut) and burn-up (completed rises toward a scope line; Linear, Jira burnup). Burn-up makes scope change visible as a moving ceiling without a separate log.
- Common elements worth having regardless: an ideal/target guideline drawn dotted or grey, weekend-aware target, a points/count toggle, a scope-change audit list, and a frozen final state once the sprint closes.
- Jira's red/green pairing is a colour-blindness risk; Linear's grey/blue/yellow avoids it.
- Existence of third-party report vendors suggests native sprint reports in Jira/Linear leave gaps (inference, not evidenced directly).

### Gaps
- Where the Linear cycle graph sits in the layout (cycle sidebar/details panel), its size, and accompanying stats (percent complete, per-assignee/label breakdown): unverified recall; snippet did not cover.
- Jira sprint report page layout, velocity chart, cumulative flow diagram specifics: not retrieved.
- Shortcut cumulative flow: nothing found.
- Plane cycle/module analytics and GitHub Projects insights charts: not searched to conclusion.

## 5. What published design-system details exist?

### Takeaway
Linear's theme system is officially described as LCH-based generation from a small set of inputs (base, accent, contrast), and in 2026 that system reportedly drives the default light/dark themes too. Atlassian publishes a full semantic token system (`color.*`, `elevation.surface.*` mapped to `--ds-*` CSS variables). Plane launched "Propel" in autumn 2026 with shared tokens across light and dark. Exact official hex/LCH tables were not retrievable in this session.

### Cited Findings
**Linear**
- Linear rebuilt its custom-theme generator using the LCH colour space instead of HSL; the generator also takes a contrast variable defining how contrasty a theme is — [Linear, How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) (2024, older)
- A Chinese-language write-up states the LCH system now powers Linear's default light and dark themes, not only custom ones — [sspai](https://sspai.com/post/104449) (secondary)
- Third-party deconstruction: theme derives from three inputs (base, accent, contrast level); every colour is an [L, C, H] triple manipulated in LCH and converted to RGB only at CSS output. Its worked example uses dark base L=12, C=2, H=270 and purple accent L=55, C=80, H=300; hover/selection colours derive from accent by adjusting L and C — [thedjpetersen, The Three-Variable Theme](https://astro-thedjpetersen-com.pages.dev/thoughts/linear-theme) (the example values are the author's illustration, not confirmed as Linear's production values)
- 2026 default palette reported as a warmer, less saturated grey with reduced separator contrast — [deeplangai feed](https://grain-8opupt1uu-deeplangai.vercel.app/feed/OVMC4GyElMX) (secondary)
- Typeface per extractions: Inter Variable — [oh-my-opencode linear.app reference](https://cdn.jsdelivr.net/npm/oh-my-opencode@4.18.2/dist/skills/frontend/references/design/linear.app.md) (unofficial)
- Linear published a post on Apple's Liquid Glass — [Linear, Linear Liquid Glass](https://linear.app/blog/linear-liquid-glass) (content not retrieved)

**Atlassian Design System**
- Tokens are semantic and used in code as `token('color.background.neutral')`, which resolves to `var(--ds-background-neutral)` — [ADS, Use tokens in code](https://atlassian.design/foundations/tokens/use-tokens-in-code)
- `color.background.neutral` is a transparent (alpha) colour; it can look like `elevation.surface.sunken` in light mode but behaves differently in dark mode — [ADS, Elevation](https://atlassian.design/foundations/elevation)
- Dark-theme `elevation.surface` reported by developers as #1D2125; another developer reports `--ds-surface` as #1f1f21 on Confluence pages — [Atlassian developer community thread](https://community.developer.atlassian.com/t/elevation-surface-token-resolves-to-different-values/92865) (conflicting values; likely old vs refreshed theme, unconfirmed)
- Hex codes, RGBA values and dark-mode mappings are published on ADS palette pages; tokens, new colour foundations and dark mode were introduced together — [ADS, Color](https://atlassian.design/foundations/color-new); [Atlassian developer community announcement](https://community.developer.atlassian.com/t/introducing-design-tokens-new-colour-foundations-and-dark-mode/62258/49); [ADS, What's new in foundations](https://atlassian.design/tokens/whats-new-in-foundations)

**Plane**
- Plane's interface core was rebuilt on Propel (30 Sep 2026 changelog; announcement dated 19 Oct 2026); light and dark themes share the same tokens; live on Plane Cloud and self-hosted from 4.0.0; component docs at propel.plane.so — [Plane changelog 2026-09-30](https://plane.so/changelog/2026-09-30-plane-agents-propel-new-ai-models); [Plane blog, Introducing Propel](https://plane.so/blog/propel-plane-design-system); [Plane changelog v4.0.0](https://plane.so/changelog/release-v4-0-0-plane-agents-ui-refresh-work-item-security)

**GitHub**
- No Primer details were surfaced by the searches run.

### Inferences
- Generating a theme from few perceptual inputs (base, accent, contrast) in LCH/OKLCH gives consistent perceived lightness steps across hues and makes high-contrast and custom themes cheap; elevation becomes lightness offsets from base.
- Atlassian's lesson: neutral backgrounds as alpha overlays behave differently from opaque surface tokens across themes; pick one model per token role and document it.
- Sharing one token set across light and dark (Plane, Atlassian) is the norm; themes swap values, not names.

### Gaps
- Linear's actual production LCH/hex values, type scale, Inter Display usage for headings, radii, shadows: not published in any source reached. "Inter Display for headings, Inter for body" is unverified recall of the 2024 post.
- Atlassian palette hex table, type scale, spacing scale, and the 2025 typography refresh / "Atlassian Sans": atlassian.design blocked; search returned nothing on the typeface.
- Propel token values: propel.plane.so not fetched.
- Primer (GitHub) colour/typography tokens: not researched to conclusion.

## 6. What do designers and users criticise about these UIs?

### Takeaway
Jira draws the most concrete, well-documented criticism (forced navigation change, more clicks, laptop-width breakage, inconsistent status colours, shortcut changes). Criticism of Linear is mostly indirect: the "Linear look" is called monotonous and over-copied, and its 2026 move to lower contrast runs into general low-contrast-text complaints.

### Cited Findings
**Jira**
- Users describe the new navigation as chaotic, reducing efficiency, and requiring more clicks for daily tasks; one called the layout "IMPOSSIBLE" to use on a laptop monitor — [Atlassian Community, Feedback about degraded UX and usability of Jira](https://community.atlassian.com/forums/Navigation-Refresh-discussions/Feedback-about-degraded-user-experience-and-usability-of-Jira/td-p/3194776); [Jira's fresh look and navigation comments](https://community.atlassian.com/forums/Jira-articles/Jira-s-fresh-look-and-navigation/bc-p/3019352)
- Early testers could not find archived issues and the Issues link; some wanted to hide the sidebar on dashboards — [Atlassian Community, Try out the new navigation in Jira](https://tnckb94959.lithium.com/forums/Jira-articles/Try-out-the-new-navigation-in-Jira/bc-p/2934243)
- Complaints of inconsistent status colours/design and a "big bang" deployment; an Atlassian moderator conceded short timelines may lead to design and implementation mistakes — [Atlassian Community, Jira 2025 changes: how user experience has degraded](https://community.atlassian.com/forums/Jira-Cloud-Admins-discussions/Jira-2025-Changes-How-User-Experience-has-degraded-Is-Atlassian/m-p/3194686)
- Users requested a permanent opt-out — [Atlassian Community, Keep the old navigation](https://community.atlassian.com/forums/Navigation-Refresh-articles/Keep-the-old-navigation-permanent-opt-out/bc-p/3004154)
- Sidebar toggle changed from `[` to `Ctrl+[`, drawing objections; custom-branded sites delayed — [Atlassian Community, A full-height sidebar](https://community.atlassian.com/forums/Navigation-Refresh-articles/A-full-height-sidebar-for-better-navigation/bc-p/3156390)
- A February 2026 thread asks whether Atlassian is ignoring user feedback — [Atlassian Community](https://community.atlassian.com/forums/Jira-Cloud-Admins-discussions/Jira-2025-Changes-How-User-Experience-has-degraded-Is-Atlassian/m-p/3194686)
- Caveat: these are forum posts showing intensity, not prevalence; no independent survey found.

**Linear and the "Linear style"**
- Products following the trend "start to look monotonous"; a follow-up says nearly all showcased sites looked the same a year later and the appeal is wearing off through oversaturation, with loss of brand identity — [LogRocket, Linear design](https://blog.logrocket.com/ux-design/linear-design); [LogRocket, Linear design vs brutalism, neumorphism, minimalism](https://blog.logrocket.com/ux-design/linear-design-vs-brutalism-neumorphism-minimalism/)
- Smashing Magazine argues big products increasingly look alike in muted/greyscale palettes (general web critique, not Linear-specific) — [Smashing Magazine, The Grayscale Problem (Oct 2025)](https://smashingmagazine.com/2025/10/the-grayscale-problem)
- Light-grey-on-white "clean" text is criticised as failing the 4.5:1 contrast needed for normal text — [Peerlist, Clean design is usually just lazy UX](https://peerlist.io/somyaverma/articles/clean-design-is-usually-just-lazy-ux)
- Linear's 2026 refresh lowered inactive sidebar text contrast and separator contrast, i.e. moved further toward muted grey; the title of one analysis is itself sceptical ("dimmed its sidebar and called it a design principle") — [deeplangai feed](https://grain-8opupt1uu-deeplangai.vercel.app/feed/OVMC4GyElMX)
- Density is described as a power-user optimisation (i.e. a cost to novices) — [buildmvpfast](https://www.buildmvpfast.com/blog/linear-aesthetic-tokens-density-keyboard-first-ux-2026)

**Plane / Shortcut (self-identified problems they fixed)**
- Plane: read-only data mixed among editable properties; activity feed losing scroll position; nested Escape closing the wrong layer — [Plane blog](https://plane.so/blog/new-work-item-detail-view-custom-relations-and-more); [Plane changelog 2026-09-30](https://plane.so/changelog/2026-09-30-plane-agents-propel-new-ai-models)
- Shortcut: colour was the most contested part of its redesign; chose incremental shipping over a single big release — [Shortcut blog](https://shortcut.com/blog/designing-a-calmer-clearer-faster-shortcut)

### Inferences
- Mistakes to avoid, drawn from the above: (a) relocating primary navigation without an opt-out or transition period; (b) changing an established single-key shortcut; (c) sidebars that do not collapse gracefully at laptop widths; (d) inconsistent status colour semantics across surfaces; (e) de-emphasis achieved by pushing text below WCAG 4.5:1; (f) a generic dark-grey-plus-purple look with no brand identity; (g) mixing reference and editable fields; (h) icon overload competing with titles.
- Receding chrome and accessible contrast are in tension; a contrast input in the theme generator (as Linear has) is one way to let users resolve it.
- Incremental redesign (Shortcut) drew less documented backlash than big-bang (Jira).

### Gaps
- No named-designer critique of Linear's app UI was found; criticism located is trend-level.
- No criticism sources found for GitHub Projects, Plane or Shortcut from outside the vendors.
- Dribbble, Behance, Mobbin, Refero, Awwwards: not reached and not surfaced in search results; no findings from them.
- Hosts that must be allowed in the session network settings for a fuller pass: linear.app, atlassian.design, plushcap.com, buildmvpfast.com (others such as plane.so, shortcut.com, docs.github.com were not attempted after the first failures).
