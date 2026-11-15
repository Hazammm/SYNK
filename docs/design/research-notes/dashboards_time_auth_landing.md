# Dashboards, time tracking, auth/onboarding and landing pages: UI/UX competitive notes (as of Nov 2026)

> **Read this first: evidence quality.**
> Every direct page fetch in this session failed. The session's network allowlist blocked all hosts tried (evilmartians.com, support.toggl.com, saasui.design, saasframe.io, vercel.com, cieden.com, linear.app). Nothing below comes from reading a full page or viewing a screenshot.
> All findings come from **web-search result summaries/snippets** (21 searches). Consequences:
> - Pixel values, hex colours and type sizes are mostly from third-party "design system reconstruction" sites, not from the products themselves. Treat as approximate.
> - Where the search summary did not say which result a claim came from, the citation is marked **(attribution uncertain)** and points to the most likely page in that result set.
> - Dribbble, Behance, Pinterest, Mobbin, Refero, Awwwards, Land-book and Godly were **not reached at all**. No award-winner analysis is included.
> - Items I know only from prior familiarity, not confirmed this session, are placed under Gaps or marked "unverified" under Inferences.

---

## 1. What is the anatomy of a best-in-class timer and timesheet UI?

### Takeaway
The three market leaders converge on one structure: a single-row timer bar pinned at the top (description, project, tags, billable, duration, start/stop), a mode switch between running timer and manual entry, and several synchronised views of the same entries (list grouped by day, calendar grid, weekly timesheet grid). Keyboard entry (shortcuts, natural duration parsing, inline `@project` / `#tag` tokens) is the main speed mechanism.

### Cited Findings

**Toggl Track**
- The timer bar keeps description, project, tags, billable status, duration and start/stop in one row (third-party review wording). — [ClickUp review of Toggl, 2026](https://clickup.com/learn/topic/productivity/tools/toggl/)
- Older support docs: under the timer bar, entries can be viewed three ways (Calendar, List, Timesheet), with a Settings button for display and calendar options. — [Toggl support: the timer page](https://support.toggl.com/the-timer-page)
- Newer "Toggl 2.0" docs describe a different structure: timer bar on top; Timesheet is reached from the Calendar tab via view options. The layout has changed over time, so older screenshots may be stale. — [Toggl docs: time tracking in Toggl 2.0](https://docs.toggl.com/time-tracking-in-toggl-2-0)
- Inline tokens in the description field: `@` assigns a project, `#` adds a tag. — [Toggl support: creating a time entry](https://support.toggl.com/en-us/article/creating-a-time-entry-wg8nug/)
- Billable is a `$` icon toggle on the entry. If the project is billable, new entries default to billable. Clicking Play on an existing entry (continue) copies its billable state; starting from a Favorite copies it too. — [Toggl support: creating a time entry](https://support.toggl.com/en-us/article/creating-a-time-entry-wg8nug/)
- Calendar view: week-by-week grid, entries coloured by project colour; zoom with plus/minus buttons; day, 5-day (weekends hidden) and week modes; clicking an empty slot creates an entry at that time; tracked vs planned time shown under each day; Google/Outlook events can be overlaid. — [Toggl support: tracking time in the calendar view](https://support.toggl.com/tracking-time-in-the-calendar-view); [Toggl blog: calendar view feature](https://toggl.com/blog/calendar-view-feature)
- Timesheet view: tasks as rows, days as columns; summarises the week per row; edits sync in real time with List and Calendar views. — [Toggl docs: using the timesheet view](https://docs.toggl.com/using-the-timesheet-view)
- Toggl Focus timesheet hides the task sidebar by default so the time grid stays readable. — [Toggl support: timesheet view in Toggl Focus](https://support.toggl.com/focus/using-the-timesheet-view-in-toggl-focus)

**Harvest**
- Two timesheet views under Time > Timesheet: Day view and Week view. — [Harvest help: Members, tracking time](https://support.getharvest.com/hc/en-us/articles/360048181612-Members-Tracking-time)
- Day view: a "Start timer" button, or type a duration (or start and end times, depending on a setting) and click "Save entry". — [Harvest help: Members, tracking time](https://support.getharvest.com/hc/en-us/articles/360048181612-Members-Tracking-time)
- Week view: "+ Add row", pick project and task, type hours into day cells. Constraints: only available when timer mode is "Track time via duration"; notes cannot be added in Week view. Shortcut: `N` adds a new row. — [Harvest help: track and edit time in the Week view](https://support.getharvest.com/hc/en-us/articles/360048687531-Track-and-edit-time-in-the-Week-view)
- Timesheet behaviour (duration vs start/end) is a per-account setting. — [Harvest help: timesheet settings](https://support.getharvest.com/hc/en-us/articles/360048181812-Timesheet-settings)
- Comparison article: Harvest's Day view shows the day's entries plus total hours logged; Clockify shows the whole current week on one page, grouped by day. (Published by Toggl, a competitor.) — [Toggl blog: Clockify vs Harvest, 2026](https://toggl.com/blog/clockify-vs-harvest)

**Clockify**
- Two views of entries: Time tracker (list) and Calendar (week or day). — [Toggl blog: Clockify vs Harvest, 2026](https://toggl.com/blog/clockify-vs-harvest)
- Manual mode is toggled with a list icon at the top right of the tracker bar, or by pressing `m`. — [Clockify help: adding time manually](https://clockify.me/help/track-time-and-expenses/adding-time-manually)
- Manual entry fields: start time, end time, date (calendar icon); description and project optional; billable and tags settable. — [Clockify help: adding time manually](https://clockify.me/help/track-time-and-expenses/adding-time-manually)
- Typing a duration such as `2h` fills the times automatically. When adding several entries in a row, the previous entry's end time becomes the next start time. — [Clockify help: adding time manually](https://clockify.me/help/track-time-and-expenses/adding-time-manually)
- Overnight entries show a superscript number next to the end time. — [Clockify help: adding time manually](https://clockify.me/help/track-time-and-expenses/adding-time-manually)
- Keyboard flow: Tab between fields, Enter on ADD to commit. — [Clockify help: adding time manually](https://clockify.me/help/track-time-and-expenses/adding-time-manually)
- Timesheet view: plus sign to pick a project, type time in the day cell, "Add row" for a new line; must be enabled by a workspace admin. — [Clockify help: timesheet](https://clockify.me/help/track-time-and-expenses/timesheet-view)

### Inferences
- Common anatomy across all three, top to bottom: (1) timer/entry bar, (2) view switcher, (3) entries. A Synk time view with running timer, manual entry, weekly bar chart and entries list fits this order, with the chart between the bar and the list.
- Timer vs manual is a mode of the same bar (Clockify, Toggl), not a separate form. Harvest instead puts both in one Day-view form: a duration field plus "Start timer" as the alternative to "Save entry".
- Duration fields accept loose text (`2h`) and chain start times. This removes most of the cost of manual entry.
- "Continue" (replay a past entry) inherits all metadata. That makes the entries list double as a launcher.
- Project colour is the only colour carried into calendar blocks. Chart colour by project would be consistent with that.
- Real-time sync across views is stated explicitly by Toggl; a single source of truth with multiple projections is the expected model.

### Gaps
- Exact list-view anatomy (day group header, per-day total, per-week total, collapsed duplicate entries, row hover actions) was not confirmed for any product. Search results did not cover it.
- No verified detail on how the weekly bar chart is styled in Toggl/Clockify dashboards (stacked by project, daily total labels, axis treatment).
- Running-timer presentation in the browser tab title, global header, and idle detection: not found.
- No Dribbble/Behance/Pinterest "time tracking dashboard" results were reachable.

---

## 2. How do premium dashboards present KPIs and charts without clutter?

### Takeaway
The recurring tile formula is: short label, one large number, a comparison (previous period or target) with a signed and colour-coded delta, and optionally a small sparkline that supports the number without replacing it. Vercel's published interface guidelines require tabular figures for number columns and comparisons; Linear builds every chart from one Measure, one Slice and an optional colour Segment, always paired with a table.

### Cited Findings

**Tile anatomy**
- A "fully contextualised" KPI card has: concise label, bold headline number, a target (e.g. same period last year), a colour-coded gap, and a 30-day sparkline with moving average and a "today" callout. A bare number (e.g. "518M") is contrasted with the same number plus target ("483M") and gap ("35.4M, 7.3% above target"). (Power BI context, but the anatomy is tool-agnostic.) — [Tabular Editor: KPI card best practices](https://tabulareditor.com/blog/kpi-card-best-practices-dashboard-design)
- Sparklines should complement numbers, not replace them; limit them to the one or two metrics that matter most; use small-multiple line charts when labelled axes and precise comparison are needed. (attribution uncertain; from the same result set) — [Domo: sparkline chart](https://domo-webflow.domo.com/learn/charts/sparkline-chart)
- Use one consistent palette across the dashboard and reserve bright colours for alerts; high contrast and clear typography. — [FusionCharts: dashboard design best practices](https://www.fusioncharts.com/blog/dashboard-design-best-practices/)

**Number typography**
- Vercel Web Interface Guidelines: use `font-variant-numeric: tabular-nums` for number columns and comparisons; a monospace face such as Geist Mono is an accepted alternative. — [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines); [GitHub mirror](https://github.com/vercel-labs/web-interface-guidelines)

**Stripe dashboard**
- Home is user-configurable on mobile: "Add or edit charts" at the bottom of Home; four metric widgets (daily gross volume, daily new payments, daily new customers, daily net volume). — [Stripe docs: Dashboard mobile app](https://docs.stripe.com/dashboard/mobile)
- Third-party breakdown: home shows five numbers (gross volume, net volume, new customers, successful payments, date-range comparison) with small sparklines beneath showing trend direction. May describe an older or simplified view; conflicts with the configurable description above. — [925studios: Stripe dashboard design breakdown](https://www.925studios.co/blog/stripe-dashboard-design-breakdown)

**Vercel dashboard**
- Navigation redesign: opt-in beta in January 2026, default for everyone from 26 February 2026. Horizontal tabs moved into a resizable sidebar that can be hidden; tabs are consistent between team and project level; projects act as filters; mobile gets a floating bottom bar. — [Vercel changelog: dashboard redesign now default](https://vercel.com/changelog/dashboard-navigation-redesign-rollout); [Vercel changelog: new dashboard navigation available](https://vercel.com/changelog/new-dashboard-navigation-available)
- One user reaction: the new sidebar "feels like the Supabase main sidebar" and the old UI felt faster. (single anecdote) — [X post, Jan 2026](https://x.com/MakeDesignPop/status/2014588064958677420)
- Geist (third-party reconstructions, values disagree between sources): Geist Sans for UI at weights 400/500/600/700, Geist Mono for code and technical labels; body about 14px (0.875rem) at 1.5 line height, section headings about 20px weight 600, labels 14px weight 500; 4px spacing base with steps 8/12/16/24/32/48; 8-16px gaps inside cards, 24-32px between sections; near-monochrome palette with blue `#0070f3` for links/info, red for errors, amber for warnings. — [seedflip: Vercel design system breakdown](https://seedflip.co/blog/vercel-design-system); [shadcn.io: Vercel Geist](https://www.shadcn.io/design/vercel)

**Linear Insights and sprint (cycle) reporting**
- Insights is built from a Measure (y-axis) and a Slice (x-axis), producing a graph plus a table. Segments are optional and use colour to split further. — [Linear docs: Insights](https://linear.app/docs/insights)
- Scale of controls at launch (2023, older): about half a dozen measures, 15 dimensions, 9 segments, plus filters and time grouping. — [Linear on X, March 2023](https://x.com/linear/status/1640730445577957378)
- Interaction: hovering a bar shows values and percentile breakdowns; selecting a bar or segment filters the underlying issue view. Scatterplots mark the 25th, 50th, 75th and 95th percentiles. — [Linear docs: Insights](https://linear.app/docs/insights)
- Burn-up is a Slice option, not a separate report type, and uses historical issue data. — [Linear docs: Insights](https://linear.app/docs/insights)
- Cycle graph tracks four series: total scope (grey line), started (yellow line), completed (solid blue line), target completion rate (dotted blue line). Completed above target means on pace. — [Linear Learn: insights and analytics](https://linear.app/learn/insights-and-analytics)
- Dashboards (multiple insights on one page) shipped 24 July 2025. — [Linear changelog: Dashboards](https://linear.app/changelog/2025-07-24-dashboards)

### Inferences
- Tile anatomy that recurs: label (small, muted) / value (largest element, tabular figures) / delta with sign and direction / optional sparkline. Colour is used on the delta only, not the value.
- Linear's cycle graph uses a semantic colour per status (grey scope, yellow in progress, blue done) and line style (dotted) for the target. A sprint report can reuse the app's status colours as series colours so no legend lookup is needed.
- "Chart plus table of the same data" (Linear) gives exact values without labelling every bar, which keeps the chart itself clean.
- Click-to-filter from a chart mark to the underlying list is the interaction that makes a report actionable; it also suits a weekly hours bar chart (click a day, filter the entries list).
- The Vercel move from top tabs to a collapsible sidebar (Feb 2026) signals that sidebar-first app shells are the current norm for multi-section products.

### Gaps
- Stat-tile pixel dimensions, grid column counts and breakpoints for Stripe, Vercel and Attio were not obtained; the saasui.design KPI-card article that likely contains them could not be fetched.
- Attio dashboard/report specifics: nothing found.
- No primary source reached for Stripe's chart styling (gridlines, axis labels, hover crosshair). Unverified recollection: Stripe's home charts use a thin single-colour line with a grey comparison line for the prior period and minimal axes.
- Recent-activity feed and "my tickets" list patterns were not researched within the call budget.

---

## 3. Current best practices for auth and onboarding screens

### Takeaway
Guidance in 2025-2026 treats passwordless and SSO options as first-class peers of email/password, keeps password rules visible beside the field instead of revealing them on failure, and replaces "confirm password" with a show/hide toggle. For onboarding, wizards are kept to roughly 3-5 steps with an explicit "Step N of M" indicator, and Linear is the most-cited reference for a short sequence that sets preferences and teaches the command menu before the workspace loads.

### Cited Findings

**Login / signup layout and methods**
- Split screen, modal and minimal single-form layouts are all in common use; a typical split puts quick login options on one side and the value proposition on the other. — [Eleken: login page examples, updated March 2026](https://www.eleken.co/blog-posts/login-page-examples)
- "2026 baseline: passwordless and accessible by default"; lead with enterprise SSO where relevant, with "Use a passkey" as a peer option. — [Cieden: login page design](https://cieden.com/book/pages-and-flows/login/login-page-design)
- Modern sites favour magic links or biometric prompts over complex puzzles and strict password rules. — [LoginPress: modern login UX patterns 2026](https://loginpress.pro/?p=247672)
- Keep the essentials even in a minimal layout, e.g. the reset-password link. — [HubSpot: login screen best practices](https://blog.hubspot.com/website/login-screen)
- The two-page login pattern (email first, password on the next screen) is criticised for breaking password managers and adding steps. (2024, older) — [Smashing Magazine: 2-page login pattern, and how to fix it](https://www.smashingmagazine.com/2024/06/2-page-login-pattern-how-fix-it)

**Password fields**
- Show requirements when and where relevant, as help text next to the field; with several rules, list them as bullets directly under the field. (2023, older) — [Echobind: designing signup and login forms](https://echobind.com/post/designing-signup-and-login-forms)
- Let users reveal the password instead of forcing a confirmation field. (2023, older) — [Echobind: designing signup and login forms](https://echobind.com/post/designing-signup-and-login-forms)
- Display requirements near the control so they are visible while typing. (2024, older) — [UX World](https://uxdworld.com/?p=8088)

**Validation and error presentation**
- NN/g: validate inline where possible; a validation summary must never be the only error indicator; error copy should be explicit, human-readable, polite, precise and constructive. — [NN/g: 10 design guidelines for reporting errors in forms](https://www.nngroup.com/articles/errors-forms-design-guidelines/)
- Do not cover the user's input or the message with the error; do not rely on colour alone. (2022, older) — [Smashing Magazine: designing better error messages UX](https://www.smashingmagazine.com/2022/08/error-messages-ux-design/)
- Vercel guidelines: show errors next to their fields; on submit, focus the first error. Keep the submit button enabled until the request starts, then show a spinner while keeping the original label. Loading labels end with an ellipsis ("Saving…"). Async updates (toasts, validation messages) use `aria-live="polite"`. — [Vercel Web Interface Guidelines](https://vercel.com/design/guidelines); [GitHub: vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)
- Spinners: a short show-delay plus a minimum visible time to avoid flicker. (from the guideline mirrors; exact ms values not confirmed) — [GitHub: vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/README.md)
- Secondary sources: validate on blur, not per keystroke; debounce 300-500 ms for format-only rules. — [IvyForms: form error message examples](https://ivyforms.com/blog/form-error-message-examples/); [FormCreatorAI: inline validation](https://www.formcreatorai.com/inline-validation-error-messages-accessible-real-time)

**Toasts**
- Toasts should not carry form-field errors; errors go beside the field, or in a banner/modal if the user cannot proceed. — [72Technologies: toast notification UX patterns](https://www.72technologies.com/blog/toast-notifications-ux-patterns-that-work)
- Duration guidance conflicts: about 3-4 s for short confirmations and longer for errors — [Better Design: notifications](https://better-design.com/principles/ux/notifications); versus 4-6 s standard and at least 8 s or persistent for errors — [The Hangline: toast notification design](https://www.thehangline.com/toast-notification-design-best-practices-for-non-intrusive-user-feedback/). Toasts with Undo: about 6-10 s. — [72Technologies](https://www.72technologies.com/blog/toast-notifications-ux-patterns-that-work)
- Position: pick one location and keep all toasts there. Bottom-centre on mobile (clear of keyboard and gesture areas); a bottom or top corner on desktop. — [Better Design: notifications](https://better-design.com/principles/ux/notifications); [72Technologies](https://www.72technologies.com/blog/toast-notifications-ux-patterns-that-work)

**Wizards and workspace creation**
- Show both current and total steps ("Step 3 of 5"), not a bar alone; keep the total under seven. (attribution uncertain) — [DesignRevision: SaaS onboarding best practices 2026](https://designrevision.com/blog/saas-onboarding-best-practices)
- Wizards suit setups that need specific data before the product is useful; 3-5 steps is the recommended ceiling; allow exit and resume because not everyone finishes in one sitting. — [Eleken: wizard UI pattern](https://www.eleken.co/blog-posts/wizard-ui-pattern-explained)
- Progress must be honest: reflect real completion, no artificial head start. (attribution uncertain) — [saasui.design: onboarding checklist UX 2026](https://www.saasui.design/blog/saas-onboarding-checklist-ux-patterns)
- Sources disagree on checklist vs progress bar for post-wizard setup: one says checklists build more momentum, another says bars outperform numeric indicators. — [ProductLed: onboarding best practices](https://productled.com/blog/5-best-practices-for-better-saas-user-onboarding); [DesignRevision](https://designrevision.com/blog/saas-onboarding-best-practices)
- Unverified claim: Notion's subtle progress indicator in template selection yields 55% onboarding completion vs a 20-30% industry average. No primary source; do not rely on it. (attribution uncertain) — [DesignRevision](https://designrevision.com/blog/saas-onboarding-best-practices)

**Linear onboarding (teardowns disagree on exact order)**
- Sequence per one teardown: Google OAuth sign-in, workspace creation with domain auto-join, theme selection, command-menu introduction, all before the workspace is populated. — [Candu: Linear onboarding teardown](https://www.candu.ai/blog/linear-onboarding-teardown)
- Another describes a welcome screen plus 7 steps and claims signup to first issue in about one minute. — [Supademo: Linear onboarding flow](https://supademo.com/user-flow-examples/linear)
- A screen recording index lists workspace naming, region selection, profile setup, invite teammate (at 01:08), then onboarding tasks (01:33). — [Page Flows: Linear onboarding on web](https://pageflows.com/post/desktop-web/onboarding/linear/)
- A personal account says light/dark choice came immediately after the welcome screen and that matching-email-domain auto-join replaced explicit invites. This conflicts with the Page Flows sequence; the flow probably changed between recordings. — [Growth Dives: the onboarding Linear built without A/B testing](https://www.growthdives.com/p/the-onboarding-linear-built-without)
- After onboarding, the workspace is pre-populated with issues that act as the tutorial, avoiding an empty state. — [decryptd: Linear's onboarding skips the empty state problem](https://decryptd.co/linears-onboarding-skips-the-empty-state-problem)

### Inferences
- Order of auth methods implied by the 2026 guidance: SSO/social and passkey buttons above, an "or" divider, then email/password. The cited sources do not give a tested ranking of social-above vs social-below.
- Split layout vs centred card is treated as a brand choice, not a usability difference; no source found measured one against the other.
- For forgot/reset/invite-join, the same field rules apply: persistent requirement list under the new-password field, show/hide toggle, no confirm field, error beside the field, focus moved to first error.
- A create-workspace wizard in the 3-5 step range matches both the general guidance and Linear's flow (name/URL, profile, preference, invite). Invite is consistently a late, skippable step.
- Seeding the new workspace with sample tickets (Linear) solves the first-run empty dashboard and doubles as a tutorial.
- Toast use is limited to confirmations and undo; errors that block a form are inline. Durations: a design can safely pick about 4-5 s for confirmation and persistent-until-dismissed for errors, which sits inside both conflicting ranges.

### Gaps
- No data comparing split-screen vs centred-card conversion.
- Attio, Notion, Vercel and Clerk onboarding/auth screens: no teardown found (Attio searches returned nothing).
- Invite-join page patterns (showing inviter name, workspace avatar, pre-filled locked email) not found in any source. Unverified recollection: Linear, Notion and Slack all show the workspace name/logo and inviter on the join screen and lock the invited email.
- NIST-aligned password rules (length over composition) were not retrieved this session.
- Mobbin, Refero and Page Flows screenshots could not be viewed.

---

## 4. Landing pages: section structure, hero patterns, typography, motion, and over-used "AI template" patterns

### Takeaway
Evil Martians' study of 100+ dev-tool pages found a near-universal skeleton: centred hero with a product visual, trust block, problem-led features, curated testimonials, final CTA, in a centred max-width container with restrained interaction. Practitioner commentary in 2026 is consistent that the "AI default" look (Inter everywhere, purple-to-blue gradient hero, gradient text, glassmorphism with glow, rows of identical rounded cards, emoji icons, floating particles, generic "Get Started") now reads as undifferentiated; the stated remedy is a committed visual direction, not avoiding any single element.

### Cited Findings

**Structure (Evil Martians, July 2025; older than a year but the most systematic source)**
- Scope: 100+ dev-tool landing pages including Linear, Vercel, Supabase; author Anton Lovchikov, Head of Design. — [Evil Martians: we studied 100 dev tool landing pages](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025)
- Hero pattern is highly consistent: centred composition with a product visual (static UI, animation or live embed) and a clear CTA. — [Evil Martians](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025); [daily.dev summary](https://daily.dev/posts/we-studied-100-dev-tool-landing-pages-here-s-what-really-works-in-2025-martian-chronicles-evil-mart-o9zilhyzn)
- Page order: hero, trust block (client logos or usage stats), feature block, social proof, final CTA. Features are organised around user problems, not functions. — [daily.dev summary](https://daily.dev/posts/we-studied-100-dev-tool-landing-pages-here-s-what-really-works-in-2025-martian-chronicles-evil-mart-o9zilhyzn)
- "Almost all pages use a centered layout with a max-width container"; most avoid flashy interactions. — [Evil Martians](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025)
- Nearly all use curated testimonials; only a handful show pricing on the landing page. — [Evil Martians](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025)
- Two rules across nearly every page: "No salesy BS" and "Clever and simple wins". — [Evil Martians](https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025)
- Evil Martians' later AppSignal homepage (bolder hero-led design) reported +14% activated users. — [Evil Martians: +14% activated users for AppSignal](https://evilmartians.com/chronicles/plus-14-percent-activated-users-for-appsignal-designing-a-new-homepage-in-code)

**Per-product observations (all third-party write-ups; several conflict)**
- Linear: dark theme, sharp type, restrained colour; hero carried by confident copy — [spell.sh: 25 best SaaS landing pages](https://spell.sh/blog/best-saas-landing-pages). Short headline and subhead paired with a live product view — [AdminLTE: 7 SaaS landing page patterns 2026](https://adminlte.io/blog/saas-landing-page-design-examples/). Looping product animations instead of static screenshots — [SaaSFrame: Linear landing page](https://www.saasframe.io/examples/linear-landing-page). The "Linear look" is summarised as dark backgrounds, grid patterns, subtle gradient headings — [Frontend Horse: The Linear Look](https://frontend.horse/articles/the-linear-look/) (older article).
- Attio: persistent announcement bar above the nav so the headline stays stable — [AdminLTE](https://adminlte.io/blog/saas-landing-page-design-examples/). Palette claims conflict: deep navy with off-white content areas and teal/purple/yellow accents — [SaaSFrame: Attio landing page](https://www.saasframe.io/examples/attio-landing-page); versus light background with bold accents — [Figma community kit](https://www.figma.com/community/file/1413637875520151701/landing-page-design-attio-ui-components-ui-kit).
- Resend: dark, developer-focused; headline, a code block showing the API, social proof; typography is the differentiator and the page "reads like well-written documentation". — [spell.sh](https://spell.sh/blog/best-saas-landing-pages)
- Clerk: hero with subtle line illustration on a soft gradient; signature element is floating interactive UI widgets (real sign-in forms); alternates light and dark sections; Suisse typeface. — [Fountn: Clerk](https://fountn.design/website/clerk/)
- Cal.com: oversized geometric headline paired with a working scheduling widget; ink `#111111`; display face Cal Sans; marketing canvas reported as off-white `#f4f4f4`. — [shadcn.io: Cal.com design](https://www.shadcn.io/design/cal); [SaaSFrame: Cal.com landing page](https://www.saasframe.io/examples/cal-com-landing-page)
- Notion: homepage relaunched around Notion 3.0 (Sept 2025) with a dark, atmospheric illustration of AI agents at night and the headline "Meet the night shift"; described elsewhere as a deep navy hero band with sticky-note dots and wire illustrations. — [relaunch.ai: Notion landing page teardown 2026](https://relaunch.ai/blog/notion-landing-page-teardown-6-cro-findings-from-100m-user-p); [refto.one: Notion home, 2026-04-30](https://refto.one/notion/home/2026-04-30)
- Vercel marketing type (third-party reconstructions, values disagree): display around 64px with strongly negative tracking (one source reports -2.4px to -2.88px), 16px body. — [seedflip: Vercel design system](https://seedflip.co/blog/vercel-design-system); the "blueprint grid" (visible construction lines framing sections) is identified as the Vercel aesthetic — [Setproduct: blueprint grid design](https://www.setproduct.com/blog/complete-guide-to-blueprint-grid-design)
- Raycast (unofficial reconstructions): near-black blue-tinted background `#07080a`; brand red `#FF6363` used mainly in a diagonal stripe motif; keycap gradient `#121212` to `#0d0d0d`; warm ambient glow `rgba(215,201,175,0.05)` behind featured elements; glowing keycaps and monospaced shortcut chips. — [open-design.ai: Raycast](https://open-design.ai/systems/raycast/); [webdesignhot: Raycast](https://www.webdesignhot.com/design.md/raycast/)
- Height: no longer a live reference. Shutdown announced March 2025, operations ended 24 September 2025. — [Creativerly: Height.app is shutting down](https://www.creativerly.com/height-app-is-shutting-down/); [Rework: Height alternatives 2026](https://resources.rework.com/tools/project-management/best-height-alternatives)

**Over-used patterns and what designers advise**
- The stale formula named in a March 2026 review: "a vague headline in a gradient background, followed by a floating mockup and a wall of logos"; a calmer page is read as more confident. (attribution uncertain) — [merge.rocks: best SaaS websites 2026](https://merge.rocks/blog/best-saas-websites-2026-when-it-comes-to-design-and-what-to-copy)
- In one review of startup sites, five used purple gradients as the primary treatment; the stated problem is uniformity, since sharing a colour story with direct competitors gives up a branding signal. (attribution uncertain) — [mejba.me: AI web design, human oversight](https://www.mejba.me/blog/ai-web-design-human-oversight)
- Recurring tell list: Inter or Roboto by default, purple-to-blue gradient hero, rows of identical rounded cards. Models pick Inter because it is the most common UI font in training data. — [925studios: AI slop design tells](https://www.925studios.co/blog/ai-slop-design-tells)
- Additional tells: glassmorphism with neon glow; "six identical cards in a row, equal weight, no hierarchy". (attribution uncertain) — [925studios: AI slop web design guide 2026](https://www.925studios.co/blog/ai-slop-web-design-guide)
- A scanner project flags emoji in UI, gradient text, glassmorphism and "Get Started" buttons. — [GitHub: deslop](https://github.com/iRehmanAhmad/deslop)
- Floating particle backgrounds and purple gradients were flagged in a YC partner's review of AI-built sites (secondhand report); AI-generated images are also called out because visitors recognise them. (attribution uncertain) — [UX Planet: I reviewed 250+ SaaS landing pages](https://uxplanet.org/i-reviewed-250-saas-landing-pages-avoid-these-10-common-design-mistakes-a1a8499e6ee8)
- Bento is contested, not banned: a secondhand, unverified figure says 67% of the top 100 SaaS sites on Product Hunt use bento layouts; bento is praised where motion, corner radius, colour and pills "belong to the same world". (attribution uncertain) — [SaaSFrame: 10 SaaS landing page trends 2026](https://www.saasframe.io/blog/10-saas-landing-page-trends-for-2026-with-real-examples); [merge.rocks](https://merge.rocks/blog/best-saas-websites-2026-when-it-comes-to-design-and-what-to-copy)
- Gradients are acceptable when tied to brand logic. (attribution uncertain) — [Veza Digital: best SaaS landing page examples](https://www.vezadigital.com/post/best-saas-landing-page-examples)
- Remedies offered: commit to a direction up front ("the root cause of slop is no decision"); pair a display face with a mono or serif and use one font decisively; keep an explicit banned list; lock tokens in a design-system file. — [superdesign: why AI design looks generic](https://superdesign.dev/blog/why-ai-design-looks-generic); [prg.sh: why your AI keeps building the same purple gradient website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website)
- Sources conflict on Inter: one calls it a fine typeface whose problem is default usage, others ban it outright. — [925studios: AI slop design tells](https://www.925studios.co/blog/ai-slop-design-tells); [GitHub: deslop](https://github.com/iRehmanAhmad/deslop)
- Alternative directions mentioned: warm cream palettes with soft shadows; custom illustration and brand-specific motion. (attribution uncertain) — [Muzli: landing page design trends 2026](https://store.muz.li/articles/landing-page-design-trends-2026)

### Inferences
- The products in scope differentiate by one "signature" device each, per the write-ups: Linear by product animation, Clerk by live components, Cal.com by a working widget, Resend by a code block and typography, Raycast by keycaps, Notion by illustration, Vercel by the blueprint grid. Showing the real product working, in the hero, is the common thread; the specific device differs.
- Section order that the evidence supports for a B2B page: announcement bar (optional), nav, centred hero with headline/subhead/primary CTA and product visual, logo or usage-stat trust block, 3-4 problem-led feature sections, testimonials, final CTA, footer. Pricing usually lives on its own page.
- Typography pattern across the reconstructions: one large display size (about 56-72px desktop) with tight negative tracking, 16px body, near-black or near-white ink, a mono face for technical labels.
- Motion is restrained in the studied set: looping product demos and scroll reveals, not parallax or particles.
- Most "avoid" lists are published by agencies and tool vendors; they are opinion. The consistent, defensible point is uniformity, not that purple or bento are inherently wrong.

### Gaps
- Awwwards, Land-book and Godly 2025-2026 SaaS winners: not reached; no winner-specific observations.
- None of the eight landing pages was viewed directly. Exact section order, hero copy, screenshot framing (browser chrome vs bare UI, tilt, fade-out mask, border glow) could not be verified. Unverified recollection: Linear and Vercel present product UI without browser chrome, cropped and faded at the bottom edge.
- The Evil Martians article could not be read in full; percentages for hero types, CTA counts and bento usage were not recovered.
- Whether any of these sites changed materially between mid-2026 and November 2026 is unknown.

---

## 5. How are settings pages structured?

### Takeaway
Secondary sources agree on a left sidebar (or vertical tabs) for settings with many sections and horizontal tabs only for a few, grouped as Profile/Account, Security, Notifications, Team/Members, Integrations, Billing, with a visually separated red Danger Zone last. Destructive actions have no save/cancel pair and are gated by typed confirmation.

### Cited Findings
- Match navigation to section count: sidebar for many sections, tabs for few. (attribution uncertain) — [saasui.design: SaaS settings page UX patterns](https://www.saasui.design/blog/saas-settings-page-ux-patterns)
- Typical categories: Profile/Account, Billing, Team/Permissions, Notifications, Integrations, Security, and a visually separated Danger Zone at the bottom. (attribution uncertain) — [saasui.design: SaaS settings page UX patterns](https://www.saasui.design/blog/saas-settings-page-ux-patterns)
- On small screens the settings sidebar collapses or becomes a menu. (attribution uncertain) — [SaaSFrame: SaaS settings page design, 6 examples](https://www.saasframe.io/blog/saas-settings-page-design-examples)
- Danger zone contents: delete account, transfer ownership, leave organisation; always require explicit confirmation (typed name, password). Visually distinct with red border or background. (attribution uncertain) — [saasui.design: profile and account UX patterns](https://www.saasui.design/blog/saas-profile-account-ux-patterns)
- The Danger Zone card has no save/cancel pair; its actions are immediate or open a confirmation dialog. (attribution uncertain) — [Perforce design spec: settings page composition](https://the-force-design-spec-site.public.dev.shared.perforce.com/patterns/compositions/settings-page/)
- Leaving a settings page with unsaved changes should trigger a confirmation dialog. (attribution uncertain) — [Setproduct: settings UI design](https://setproduct.com/blog/settings-ui-design)
- Vercel's February 2026 dashboard moved settings-style horizontal tabs into a resizable, hideable sidebar with consistent items at team and project level. — [Vercel changelog](https://vercel.com/changelog/dashboard-navigation-redesign-rollout)

### Inferences
- For Synk's seven settings areas (profile, password, sessions, notification preferences, members, invites, integrations), the count exceeds what horizontal tabs handle comfortably, so the sources point to a grouped side nav: Account (profile, password, sessions, notifications) and Workspace (members, invites, integrations).
- "No save/cancel in the Danger Zone" implies each other card carries its own save action (per-card save), as opposed to one page-level save. Per-card save also limits the unsaved-changes prompt to one card.
- Toggle-type preferences (notifications) are commonly saved immediately; text fields use explicit save. This is convention, not confirmed by a cited source this session.

### Gaps
- Sessions list anatomy (device, browser, location, last active, "this device" badge, revoke one / revoke all), members table (role select, pending badge, resend/revoke invite), notification preference matrix (event rows by channel columns) and integration cards (logo, status, connect/manage): not covered by any reachable source. Unverified recollection: Linear, Vercel and GitHub settings all follow these shapes.
- Raycast settings window structure: nothing found.
- No primary look at Stripe, Vercel, Linear or Attio settings; the saasui.design and SaaSFrame articles that likely cover them could not be fetched.
