# Chat, docs/wiki and in-product AI assistant UI/UX (state as of Nov 2026)

> **Method and reliability note (read first).** Research ran on 2026-11-15. Page fetches were blocked by this session's network allowlist for every host tried (shapeof.ai, slack.com, notion.com, zenn.dev, its.umich.edu, kunalganglani.com), so **no page was read in full**. Every cited finding below comes from **web-search result summaries/snippets** of the linked page, not from the page body. Snippets can lose context; where the snippet did not make clear which of several result URLs a detail came from, the most likely URL is linked and the finding is marked "(attribution approximate)". Dribbble, Behance, Mobbin, Refero, NN/g and Smashing Magazine were **not reached** and returned nothing usable in search. Exact pixel measurements of Slack, Discord, Teams and Notion's live clients could **not** be sourced; they are listed under Gaps, not as findings.

## What is the anatomy of a modern chat screen (sidebar, channel header, message rows, composer) and what sizes/spacing/typography are used?

### Takeaway
The 2025-26 direction across Slack, Teams and Discord is consolidation of the left side (one list mixing DMs, channels and activity, with filters and user-made sections) plus user-selectable density, rather than new message-row inventions. Unread = bold row, mention = numbered badge is the stable convention; exact pixel specs are not published by any of the vendors and could not be verified.

### Cited Findings

**Slack: sidebar and navigation**
- Slack redesign history: 2020 added customizable sidebar sections and a compose button; 2022 streamlined the sidebar and changed notification badges; Aug 2023 added a far-left navigation rail and an Activity feed (older information). — [UC Today](https://www.uctoday.com/unified-communications/slack-delivers-its-biggest-redesign-to-date/), [Slack blog: simpler sidebar](https://slack.com/intl/en-in/blog/news/simpler-streamlined-sidebar)
- A later Salesforce-announced design update describes "dedicated sections" for focus, hover-to-peek into other work without navigating, and action-based groupings that pull Activity and DMs into a single view (publication date not confirmed by the search result). — [Futurum Group](https://futurumgroup.com/insights/salesforce-announces-major-design-update-to-slack-platform)
- January 2026: desktop Slack added new **Files** and **Tools** tabs and a **Directories** page at the top of the sidebar; a "self-cleaning sidebar" suggests muting or sweeping channels that have gone inactive; the Activity tab is replaced by an **Activity hub** laid out as a flexible page that supports side-by-side views; iOS 26 mobile app got a "Liquid Glass" restyle. — [U-M ITS Slack January 2026 summary](https://its.umich.edu/communication/collaboration/slack/update/u-m-slack-january-2026-new-feature-summary)
- Slack's design team describes the first Activity view as widely adopted but "limited"; Activity 2.0 was rebuilt around triage and Slack self-reports an 80% engagement rate (company figure). — [slack.design: evolving the way millions catch up](https://slack.design/articles/no-small-task-evolving-the-way-millions-catch-up-in-slack/)

**Slack: unread and mention indicators**
- An unread conversation's name appears **bold** in the sidebar; a **numbered badge** appears when someone mentions you. On mobile, unread conversations are bolded at the top of the Home channel list. — [Slack help: Guide to notifications](https://slack.com/intl/en-gb/help/articles/360025446073-Guide-to-Slack-notifications)
- Desktop app-icon badge: **red** badge = DMs, mentions, keywords, replies in followed threads; on Windows/Linux a **blue** badge = unread activity in a workspace (lower urgency). — [Slack help: Guide to notifications](https://slack.com/intl/en-gb/help/articles/360025446073-Guide-to-Slack-notifications)
- 2026 change: the DM badge in the sidebar counts **unread conversations**, not individual messages. — [Slack help: new Activity view](https://slack.com/intl/en-in/help/articles/46751260742035-Introducing-the-new-Activity-view-in-Slack)
- Unread state is fragile infrastructure: a Jan 2025 incident broke sidebar bolding/badging for some desktop users, and the fix briefly showed wrong badge counts. — [Slack status, 6 Jan 2025](https://slack-status.com/2025-01/ad1515e459cd6abc)

**Slack: message rows and density**
- Two message themes: default (Clean) and **Compact**; Compact uses less white space between messages and **hides profile photos**. Users cannot change the font. — [Slack help: Change how messages are displayed](https://slack.com/help/articles/213893898)

**Discord**
- 25 March 2025 desktop refresh: three **UI density** settings (Compact, Default, Spacious) that are separate from the pre-existing message layout choice (Cozy vs Compact); a **resizable channel list**; new themes including "Onyx" (near-black) and a reworked Light theme. Stated goals: legibility, less visual noise, desktop/mobile consistency. — [Engadget](https://www.engadget.com/gaming/pc/discords-redesigned-pc-app-has-multiple-dark-modes-a-new-overlay-and-more-160019822.html), [BetaNews](https://betanews.com/2025/03/25/discord-game-overlay-update-desktop-customization-pc-gaming)

**Microsoft Teams**
- New chat and channels experience (announced Oct 2024, preview Nov 2024, rollout late Mar-Apr 2025): chats, teams and channels merged into **one Chat list**; the separate Teams tab is hidden by default, with a setting to restore split views. — [Message Center MC920179](https://mc.merill.net/message/MC920179), [Tarleton KB](https://services.tarleton.edu/TDClient/57/Portal/KB/Article/18675/Microsoft-Teams-New-Chat-and-Channels-Experience)
- List filters: **Unread, Chat, Channels, Meetings, Muted**; filters persist until switched off. Users can create **custom sections** that mix chats and channels. A dedicated **@mentions view** gathers all personal mentions in one list. In the combined view, **message previews are off by default** to simplify the list. — [Message Center MC920179](https://mc.merill.net/message/MC920179), [Microsoft Education blog](https://techcommunity.microsoft.com/blog/EducationBlog/new-chat-and-channels-experience-in-education/4413072)

**Generic component-library conventions (not product measurements)**
- Flat "Slack-style" row anatomy as implemented in component kits: avatar at left; display name and timestamp on one header line; message body below. — [shadcn.io chat-flat-messages block](https://www.shadcn.io/blocks/chat-flat-messages)
- MUI's chat component has a compact variant that moves the timestamp from under each message into the **group header next to the author name**. — [MUI X Chat: variants and density](https://mui.com/x/react-chat/basics/variants-and-density/)
- A community Discord userstyle exposes a compact-mode avatar size variable defaulting to **20px** (third-party CSS, not Discord's spec). — [userstyles.world style 16257](https://userstyles.world/style/16257)

### Inferences
- Three products independently converged on (a) a single mixed conversation list with filter chips, (b) user-defined sections, and (c) a dedicated triage surface for mentions/activity. A Synk chat sidebar that separates "DMs", "channels" and "activity" into rigid tabs would be going against the current direction.
- Density is now treated as a user setting with 2-3 steps (Slack 2, Discord 3 + 2 layouts). Designing message rows from a spacing token scale that can be switched (rather than hard-coded padding) matches the market.
- Teams turning previews off by default and Slack's self-cleaning sidebar both treat the channel list as something to be actively quieted; row content is trending toward name + indicator only.
- Counting unread *conversations* rather than *messages* in badges (Slack 2026) reduces badge-number inflation; this pairs with the Pumble criticism (see last section) that large counts feel overwhelming.
- Two-level indicator semantics are standard: weight change (bold) for "something new", coloured numeric badge only for "addressed to you".

### Gaps
- **No verified pixel/typography spec** for Slack, Discord or Teams message rows, sidebar widths, header heights or composer. Vendors do not publish them and the live clients could not be inspected. Widely repeated figures (Slack 15px body text with ~22px line height and 36px avatars; Discord 16px text with 40px avatars in Cozy; sidebars of roughly 240-260px; ~5-minute same-author grouping windows) are from memory only, unsourced in this session, and must be measured in the live clients before use.
- No source confirmed how the "new messages" divider line looks in Slack; Discord's is covered only via user complaints (see criticism section).
- Composer anatomy (formatting toolbar, attachment/emoji/mention buttons, send button, slash commands, draft indicators) for any product: nothing citable was retrieved.
- Channel header anatomy (title, topic, member count, tabs/canvas/pins, huddle button): nothing citable retrieved.
- Thread UI (side panel vs inline) and typing indicators: not researched within budget.
- Dribbble/Behance/Mobbin/Refero concept work: not reached.

## How do docs tools achieve calm, readable long-form pages (measure, font sizes, line height, heading scale)?

### Takeaway
The pattern is a fixed, narrow centred column (roughly a 50-75 character measure) with 16px body text at about 1.5 line height, a heading scale of roughly 1.25x/1.5x/1.875x with tighter (1.2-1.3) heading line heights, and very few typography controls exposed to the user (a width toggle and 3 font families, no point-size picker). Users of Coda and Notion repeatedly ask for more width, so a width setting per page is now expected.

### Cited Findings

**Readability baselines**
- Baymard: optimal body line length is **50-75 characters**; users struggle when line height drops below **1.4x** font size. — [Baymard: line length readability](https://baymard.com/blog/line-length-readability)
- UXPin: the 66-character target traces to Bringhurst's 45-75 character guideline; line height **1.5**, rising to **1.6-1.7** when lines exceed 75 characters. — [UXPin: optimal line length](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/)
- These are practitioner/secondary sources; the underlying eye-tracking studies (e.g. Dyson and Haselgrove, ~55 characters) were only cited second-hand. — [UXPin](https://www.uxpin.com/studio/blog/optimal-line-length-for-readability/)

**Notion**
- Third-party analysis of Notion's CSS reports: page title **40px, line-height 1.2**; H1 **1.875em, line-height 1.3**; one heading wrapper with max-width 516px (a sub-element, not the page column). — [zenn.dev scrap by ikenohi](https://zenn.dev/ikenohi/scraps/f0d8482d1362d5) (date of post not confirmed)
- Design-system write-ups and Notion-style stylesheets describe body text at **16px with ~1.5 line height**; one Notion-clone stylesheet uses a **720px** max column (that project's value, not Notion's documented width). — [hagicode design notes](https://design.hagicode.com/designs/notion/), [notion.css on Hugging Face](https://huggingface.co/spaces/sandy-try/blog/blob/main/styles/notion.css)
- Notion exposes no font-size picker. Per-page controls in the top-right menu: **default width vs full width** toggle, and three type styles: **Default (sans), Serif, Mono**. — [Zapier: how to change font in Notion](https://zapier.com/blog/how-to-change-font-in-notion/)
- New Notion sidebar (2026): workspace navigation, AI threads and notifications in one customizable place, with tabs for **Home, Chats (Notion AI), Meetings, Inbox, Search**; chat history sorted by recency; a **blue dot** marks a chat with an unread AI response. — [Notion help: sidebar](https://www.notion.com/help/sidebar)

**Coda (now branded Superhuman Docs in some sources)**
- Page width options: **Standard, Wide, Full width** (plus "Auto" content alignment), set from layout options revealed by hovering the page title. — [Coda community: new full-width setting](https://community.coda.io/t/launched-new-full-width-setting-to-give-you-more-space-more-control/39097)
- Users reported "Wide" gives roughly **800-900px** for non-table content, under half of a 1920px screen, and asked for more. — [Coda community: increase width of documents](https://connect.superhuman.com/t/does-coda-intend-to-increase-the-width-of-documents/26678), [Doc page size is half of my screen](https://connect.superhuman.com/t/doc-page-size-is-half-of-my-screen/27892)

**Craft / Slite**
- G2 reviewer ratings put Craft Docs' content editor at 9.7 vs Coda at 8.8 (crowd ratings; the G2 pages are internally inconsistent on Slite). — [G2: Coda vs Craft Docs](https://www.g2.com/compare/coda-coda-vs-craft-docs)
- A (possibly dated) Amplenote help page states Craft, Notion and Bear offered only a standard-width note; contradicted for Notion by its full-width toggle. — [Amplenote help](https://www.amplenote.com/help/full_width_vs_standard_note_width); contradicted by [Zapier](https://zapier.com/blog/how-to-change-font-in-notion/)
- Atlassian shipped a "Compact mode and max width" feature for Confluence for information-dense pages, showing the same narrow-vs-wide tension in a neighbouring product. — [Atlassian community](https://community.atlassian.com/forums/Confluence-articles/New-feature-Compact-Mode-and-Max-Width-to-support-information/ba-p/3190468)

### Inferences
- At 16px sans body text, a 50-75 character measure corresponds to a column of roughly 640-760px, which is consistent with the ~720px value seen in Notion-style stylesheets. Tables, boards and embeds are the content that breaks this, hence the Standard/Wide/Full switch in Coda and the full-width toggle in Notion.
- A heading scale consistent with the reported values: body 16px/1.5; H3 ~1.25em; H2 ~1.5em; H1 ~1.875em at line-height 1.3; page title 40px at 1.2. Only the title and H1 figures are sourced; H2/H3 are extrapolated.
- "Calm" in these tools comes mostly from removing chrome and choices: no ribbon toolbar, no font-size control, three font families, width as a binary. Formatting appears on demand (selection toolbar, slash menu) rather than persistently.
- Notion putting AI chat threads into the same left sidebar as the page tree and inbox suggests AI conversations are being treated as first-class navigable objects alongside docs, with their own unread dot.

### Gaps
- Notion's actual content column width (commonly quoted as about 708px with ~96px side padding) could not be confirmed from any retrieved source; treat as unverified.
- No sourced typography or width values for Craft, Slite or Coda body text.
- Doc tree navigation specifics (indent per level, disclosure chevrons, hover actions such as "+" and "...", drag-reorder affordances, breadcrumbs, favourites/recents) were not retrievable for any product.
- Editor chrome details (slash menu contents, block drag handles, selection toolbar, comment margin, table-of-contents rail) and search UI (command palette, filters, result rows) were not retrieved.
- Slite: nothing retrieved at all on its UI.

## What are the current best patterns for AI assistant panels and human-in-the-loop confirmation of agent actions (diff previews, approve/deny cards, tool-call transparency)?

### Takeaway
Shipping products now offer the assistant in several placements at once (docked right sidebar, floating window, full page) and gate data-changing actions with a card that shows the concrete effect and offers a primary Allow/Approve plus Skip/Deny, with approval scope (once / session / always) and a user-selectable approval strictness. Practitioner guidance agrees the card must show the real payload (diff of old and new values, targets) and that the pause is a run state, not a modal.

### Cited Findings

**Placement**
- Notion Agent: a circular face icon at the **bottom-right** of any page opens a **floating chat window**; the user can switch between **Sidebar** (docked on the right) and **Floating** (window over the page); expanding the left-sidebar search turns it into a **full-page** AI interface. (attribution approximate) — [Notion help: Notion Agent](https://www.notion.com/vi/help/notion-agent), [eesel: Notion AI review 2026](https://www.eesel.ai/blog/notion-ai-review)
- Notion inline AI prompts in the editor have an **"Open in chat"** icon that moves the current exchange into the sidebar chat. — [Matthias Frank: inline AI to sidebar chat](https://matthiasfrank.de/en/notion-updates/inline-ai-sidebar-chat-integration/)
- Notion moved Custom Agents from a settings-first screen to a **chat-first** screen where the agent helps configure and debug itself (interview summary, secondary). — [Latent Space wiki: Notion AI](https://latent.space/wiki/notion-ai-adfc0b84/)
- Counter-view: a third-party case study argues most bolted-on AI defaults to a chat sidebar, whereas Notion's approach is actions attached to content inside the editing flow. — [Modern AI Engineer Guide: Notion AI case](https://tonyx1998.github.io/modern-ai-engineer-guide/docs/case-studies/case-notion-ai)
- Slack: Slackbot was rebuilt as a personal context-aware agent (Jan 2026 rollout); agents are added/removed from the **top toolbar** via a list interface with larger list items and improved search; an Aug 2026 post describes a **full-screen AI workspace** for deeper work whose output (e.g. an executive summary) can be attached back to a thread. — [Slack feature drop Jan 2026](https://slack.com/blog/news/feature-drop-jan26), [Slack: Slackbot AI workspace for deep work](https://slack.com/blog/news/slackbot-ai-workspace-for-deep-work)
- Slack AI recaps: channel recap, thread summary, huddle takeaways; optional daily digest for chosen channels each morning, which can be muted while direct @mentions still notify. — [Slack feature drop Jan 2026](https://slack.com/blog/news/feature-drop-jan26), [Stanford UIT](https://uit.stanford.edu/news/reclaim-your-time-new-slack-ai-features-arrive-march-25)
- Intercom Fin: Jan 2025 changelog introduced a new **answer card** design and **expandable Messenger width**; inline **source citations** appear in Messenger chat and email but not on social channels. — [Intercom changes: new UI for Fin answers and handover](https://www.intercom.com/changes/en/80878-new-ui-for-fin-answers-and-handover-to-teammates-in-the-messenger), [Intercom help: Fin explained](https://www.intercom.com/help/en/articles/7120684-fin-ai-agent-explained)
- Intercom Fin (June 2025): quick-reply buttons removed from Fin's own answers so it converses freely; workflow reply buttons remain; the UI makes clear who is currently handling the conversation (Fin or a teammate); "Talk to a person" cannot be restyled, and Fin tries to resolve before offering escalation. — [Intercom changes: Fin is more conversational](https://www.intercom.com/changes/en/94618-fin-is-more-conversational), [Intercom help: more conversational Fin](https://www.intercom.com/help/en/articles/11433030-a-more-conversational-human-fin-experience)

**Approval / confirmation of actions**
- VS Code Copilot agent mode: a tool call that needs approval shows a confirmation with **Allow** (run once) and a dropdown on Allow to approve for the **current session, the workspace, or all future invocations**; **Skip** bypasses that single call. — [VS Code docs: use tools in chat](https://code.visualstudio.com/docs/copilot/chat/chat-tools), [Microsoft Learn: Copilot agent mode](https://learn.microsoft.com/visualstudio/ide/copilot-agent-mode)
- VS Code agent edits are applied as **pending changes** that the user can **Keep or Undo** per change (on hover inline), per file, or all at once from the chat view; Undo reverts files **without rewinding the conversation**. Visual Studio's agent lacks stepwise undo/redo. — [VS Code docs: review and revert agent changes](https://code.visualstudio.com/docs/copilot/chat/review-code-edits), [Microsoft Learn](https://learn.microsoft.com/visualstudio/ide/copilot-agent-mode)
- "Allow all"/autopilot skips confirmation for edits, terminal and external tools, but sandbox and org policy still apply (secondary source). — [SmartScope](https://smartscope.blog/en/blog/copilot-allow-all-safety-differences-assisted-permissions-sandboxing-2026/)
- Approval rules can misfire: an open VS Code issue reports terminal auto-approve rules not honoured under "Default Approvals". — [microsoft/vscode#324059](https://github.com/microsoft/vscode/issues/324059)
- Notion Agent approval setting has three levels: **"Always ask"** (before every action that changes content or uses a connected app), **"Review for me"** (default; pauses only when it flags something as potentially unsafe), **"Skip all approvals"** (no checks, even for hard-to-reverse actions). Changing the setting does not undo prior actions. — [Notion help: choose how Notion Agent asks for your approval](https://www.notion.com/help/choose-how-notion-agent-asks-for-your-approval)
- Notion **Plan mode**: the agent makes no edits while planning; it produces a plan page with a preview of what will change (e.g. which pages); edits happen only after **"Approve plan"**. — [Notion help: review and approve plans](https://www.notion.com/help/review-and-approve-plans-before-notion-ai-runs)
- Notion reversal path: ask the agent to undo, or restore from page history; no dedicated per-edit undo control was described. — [Notion help: approval settings](https://www.notion.com/help/choose-how-notion-agent-asks-for-your-approval)
- Secondary report: Notion agents can propose edits as suggestions that the user approves or rejects one by one (not confirmed against Notion's own docs). — [Collab365 Spaces](https://spaces.collab365.com/posts/notion-agents-can-now-work-inside-your-pages-and-w-8yi_cn)
- Shape of AI "Verification" pattern: applies when AI acts on the user's behalf; not required for simple low-risk tasks; trigger it according to **potential harm, scope and reversibility**. — [Shape of AI: verification](https://www.shapeof.ai/patterns/verification)
- Shape of AI "Action plan": plans are either **advisory** (reasoning aid) or **contractual** (user must verify before execution); a plan is only useful if the system follows it, and deviations should be explained, not silent. — [Shape of AI: action plan](https://shapeof.ai/patterns/action-plan)
- Practitioner pattern "dry-run preview approval": the human approves the **diff, resolved command and destinations**, not the raw tool call; "an approval card that hides the payload is theater" and should show recipient, diff, amount or tool being authorized. — [Kunal Ganglani: 10 HITL tool approval patterns (2026)](https://www.kunalganglani.com/blog/tool-approval-patterns-ai-agents)
- Diff styling guidance: muted green with "+" for additions, muted red with "−" for removals, a detail panel for key-value or diff content, and a deliberately styled approve button. — [Agentic Craft: actions](https://agentic-craft.vercel.app/actions)
- Approve / reject / **edit**: Haystack lets the human confirm, reject or modify the parameters of each tool call; other guides describe review-and-optionally-edit before an explicit confirm executes. — [Haystack docs: human in the loop](https://docs.haystack.deepset.ai/docs/2.27/human-in-the-loop)
- Risk tiering: low risk auto-run, medium risk single approver, high risk two-person rule. — [negiadventures: AI agent approval workflows](https://negiadventures.github.io/blog/ai-agent-approval-workflows.html)
- "Approval is not a UI pop-up, it is a **paused run state**"; pending decisions should be invalidated if the underlying tool contract/request changes; show a diff when the agent revises a request. — [Field Journal: human approvals for agents](https://field-journal-6cg.pages.dev/blog/human-approvals-for-agents/)
- Over-prompting risk: too permissive leads to rubber-stamping, too strict blocks everything; the unit of approval is often a plan within constraints rather than each command. — [Easton Dev: HITL agent approval design (Sep 2026)](https://eastondev.com/blog/en/posts/ai/20260911-human-in-the-loop-agent-approval-design/)
- Off-the-shelf components: a permission card with **allow once / always allow / deny**; MUI `ChatConfirmation` card gating a tool call; Cloudscape has a named "user-authorized actions" pattern. — [21st.dev tool-approval](https://21st.dev/@starc007/components/tool-approval.md), [MUI X Chat: tool approval](https://mui.com/x/react-chat/ai-and-agents/tool-approval/), [Cloudscape: user-authorized actions](https://cloudscape.design/gen-ai/patterns/user-authorized-actions/)

**Tool-call / step transparency**
- Shape of AI "Stream of thought": show the visible trace from input to answer: the plan formed, tools called, code executed and checks made; the action plan is commonly displayed inside this stream so progress can be followed. — [Shape of AI: stream of thought](https://www.shapeof.ai/patterns/stream-of-thought)
- Linear agent sessions (Developer Preview; may change): an agent reports progress by posting typed **activities**: *thought*, *action*, *elicitation* (clarification/confirmation request), *response*, *error*. Session state is derived automatically from the last activity. An agent should emit a first thought within **10 seconds** to acknowledge it has started. — [Linear developers: agent interaction](https://linear.app/developers/agent-interaction), [Linear developers: agents](https://linear.app/developers/agents)
- Linear Agent Interaction Guidelines: agents use the platform's existing UI patterns and actions (same controls as a person); give instant feedback with reasoning visible; always disclose they are agents (badge); honour requests to disengage; agents cannot be accountable, so issues are assigned to humans and only *delegated* to agents. Linear says the design language is still evolving. — [Linear AIG](https://linear.app/developers/aig.md), [Linear: approach to building the Agent Interaction SDK](https://linear.app/now/our-approach-to-building-the-agent-interaction-sdk)
- Cloudscape has dedicated patterns for "progressive steps", "thinking", "in-flow user input" and "artifact previews"; message guidance: avatars distinguish user from AI, outgoing bubbles for user and incoming for AI, and complex elements such as lists or code can sit in separate bubbles. — [Cloudscape gen-AI patterns](https://cloudscape.design/gen-ai/patterns/), [Cloudscape: generative AI chat](https://cloudscape.design/patterns/genai/generative-AI-chat/)

### Inferences
- For Synk's stated requirement (confirm/cancel preview with old and new field values), the convergent anatomy of a confirmation card is: (1) plain-language title of the action and the target record; (2) a field-level before/after table or diff with muted red "−" old and muted green "+" new; (3) primary Approve and secondary Cancel/Skip, optionally Edit; (4) scope control (this once / this session / always for this tool); (5) the agent run visibly in a "waiting for approval" state in the thread, not a blocking modal.
- A three-step strictness setting (always ask / ask when risky / never ask) is now present in Notion and effectively in Copilot, so users will expect some control over how often they are interrupted; the cited risk criteria are harm, scope and reversibility.
- Two distinct safety models exist: **approve-before-apply** (Notion plan, Copilot tool Allow) and **apply-then-keep/undo** (Copilot file edits). The second depends on cheap, reliable reversal; for data mutations without guaranteed undo, the first is the fit.
- Linear's activity taxonomy (thought / action / elicitation / response / error) is a ready-made content model for a step list: each row type can have its own icon and collapsed/expanded presentation, with the confirmation card being the "elicitation" row.
- Offering both docked-sidebar and floating placements plus a full-page mode (Notion) and a full-screen workspace (Slack) indicates no single placement has won; the docked right panel is the default for in-context work and the full page is for long tasks.
- The Linear guideline that agents act through the same UI controls as humans implies the agent's proposed change could be previewed using the same field components the edit form uses.

### Gaps
- No source showed the exact visual layout of Notion's, Slack's or Linear's confirmation cards (dimensions, button order, colours); descriptions are functional only.
- Shape of AI pages could only be read via snippets; their product screenshots and anti-pattern lists were not retrieved.
- GitHub Copilot Chat on github.com (as opposed to VS Code), Linear's own first-party AI features, and Microsoft Copilot in Teams were not covered by retrieved sources.
- No evidence was found of any of these products showing a per-field old-value/new-value table for record edits specifically; the diff evidence is for code/text and for generic guidance.
- Panel widths, message typography and avatar treatment for AI messages in specific products: not sourced.

## How do these products handle empty, loading, error and offline/reconnecting states?

### Takeaway
Sourced guidance is mostly from design systems and SDK docs rather than the named products: distinguish at least three AI states instead of one spinner, always pair indicators with text, allow instant stop, put retry on the failed item, separate "queued" from "failed" messages, and delay the reconnect banner for a few seconds so brief drops are invisible.

### Cited Findings

**AI loading / streaming**
- Cloudscape: pair loading indicators with visible loading text (accessibility); streaming begins in the generation stage; users lose confidence if unaware of processing status, especially when responses are slow or error. — [Cloudscape: gen-AI loading states](https://cloudscape.design/patterns/genai/genai-loading-states/), [Cloudscape: generative AI chat](https://cloudscape.design/patterns/genai/generative-AI-chat/)
- "Hiding the system state" is called a common mistake: users cannot tell whether the model is waiting, streaming, retrying or done; production chat UIs replace the generic spinner with at least **three distinct visible states**. — [metacto: AI chat UX patterns](https://www.metacto.com/blogs/ai-chat-ux-patterns-production)
- Stopping generation must be immediate, with no added friction. — [Cloudscape: response regeneration](https://cloudscape.design/gen-ai/patterns/response-regeneration/)
- Linear: agent should post a first "thought" within 10 seconds so the session visibly starts. — [Linear developers: agent interaction](https://linear.app/developers/agent-interaction)

**AI empty states and suggested prompts**
- Prompt starters: example prompts shown on an empty conversation before the user types; vague starters such as "Ask me anything" are warned against. — [AI UX Playground: prompt starters](https://aiuxplayground.com/pattern/prompt-starters)
- Common empty-thread layout: greeting with suggested prompts beneath. Cloudscape frames suggested ("support") prompts as also keeping a conversation going mid-thread. — [MUI X Chat: loading and empty states](https://mui.com/x/react-chat/display/loading-and-empty-states/), [Cloudscape: support prompts](https://cloudscape.design/gen-ai/patterns/support-prompts/)
- Slack's agent list has an empty state that guides the user to add a first agent with one click. — [Slack feature drop Jan 2026](https://slack.com/blog/news/feature-drop-jan26)
- Critique: AI chat products abandoned established empty-state practice in favour of a bare input box, which is linked to drop-off (single source). — [Feedbagel: death of the empty state](https://feedbagel.com/post/the-death-of-the-empty-state-in-ai-products)

**Errors**
- AI error: an error alert with a recovery action such as retry. — [Cloudscape: generative AI chat](https://cloudscape.design/patterns/genai/generative-AI-chat/)
- Chat message send failure: failed-state indicator on the message with an inline retry; retry re-submits the original message and replaces the error state. — [KendoReact: failed messages](https://www.telerik.com/kendo-react-ui/components/conversationalui/chat/messages/failed-messages), [MUI X Chat: error handling](https://mui.com/x/react-chat/behavior/error-handling/)
- Linear models "error" as a first-class agent activity type in the session timeline. — [Linear developers: agent interaction](https://linear.app/developers/agent-interaction)

**Offline / reconnecting**
- Model each send as **pending, syncing, synced or failed**; a queued message needs no user action, a failed one needs a decision (error icon + retry). — [CoderLegion: your app goes offline](https://coderlegion.com/12022/your-app-goes-offline-does-it-panic-lie-or-handle-it-gracefully)
- Stream's SDK guidance: keep the connection banner hidden for short drops and show "Reconnecting…" only after a delay (if the connection returns within **5 seconds** the user sees nothing); "offline" and "reconnecting" are separate states. — [Stream chat React: connection status](https://getstream.io/chat/docs/sdk/react/v15/features/app-experience/connection-status.md)
- An offline banner should reassure that messages are queued, not lost, and escalate only if the problem persists. — [Gecx SDK: error recovery](https://gecx-sdk-portal.vercel.app/docs/guides/error-recovery/)
- Failure mode to avoid: a widget stuck on "Reconnecting" after the network returned until the user sent a message. — [Genesys community thread](https://community.genesys.com/discussion/behavior-of-offlinereconnectingreconnected)
- Resent messages move to the bottom of the list to keep chronological order (open-source chat PR). — [RocketChat EmbeddedChat PR 1096](https://gh.r-mj.com/RocketChat/EmbeddedChat/pull/1096)

### Inferences
- A workable AI state set consistent with the sources: *acknowledged/thinking* (within seconds), *working* (named step or tool, e.g. the Linear "action" row), *streaming answer*, *waiting for your approval*, *done*, *error with retry*, plus *stopped by user*. Each needs text, not only motion.
- For an agent that pauses for confirmation, the paused state must itself read as a state in the thread (and ideally in any chat list/unread indicator, as Notion does with its blue dot), otherwise users will not know the run is blocked on them.
- Chat message send states and agent tool-call states can share one status vocabulary (pending / in progress / done / failed) and one visual treatment.

### Gaps
- No first-party documentation was retrieved for how Slack, Discord, Teams or Notion actually render offline/reconnecting banners, skeleton loaders or failed-message rows; all specifics above are from SDKs, design systems and blogs.
- No sourced details on skeleton/placeholder patterns for channel lists, message history pagination ("load older"), or doc page loading.
- No sourced details on empty states for a new channel, an empty doc, or empty search results in the named products.
- NN/g and Smashing Magazine guidance on AI chat states was searched for and not found.

## What do designers criticise about these UIs?

### Takeaway
The recurring complaints are about density and spacing changes imposed without an opt-out, unread markers that become harder to see, navigation consolidation that hurts power users (multi-workspace switching), notification counts that feel overwhelming, doc columns that are too narrow for wide content, and AI that defaults to a bolted-on chat sidebar with a bare empty state. Most evidence is user-forum posts, tech press and competitor blogs rather than formal design critique.

### Cited Findings

**Slack (Aug 2023 redesign; older information, still the basis of the current layout)**
- Opinion split between "cleaner" and "more cluttered and difficult to navigate"; the redesign fundamentally changed the experience for multi-workspace users. — [Creative Bloq](https://www.creativebloq.com/news/slack-redesign)
- Fast Company called it initially "a big step backward" for multi-workspace users because it removed the sidebar for quickly switching workspaces, while calling the **unreads-only filter** a welcome improvement. — [Fast Company](https://www.fastcompany.com/90974178/got-the-slack-redesign-try-these-tips)
- Complaints began on X within hours; Slack's SVP of product design publicly defended the changes. — [VentureBeat](https://venturebeat.com/business/slack-lash-slack-defends-controversial-redesign-amid-sharp-criticism)
- Competitor critique: the design "wants you to know that you have a lot more notifications than you can handle" (Pumble is a rival; not independent). — [Pumble](https://pumble.com/slack-redesign)
- A blog framed the redesign as part of the "enshittification of basically all digital design". — [Flagsmith](https://www.flagsmith.com/blog/the-enshittification-of-basically-all-digital-design-slack-redesign)
- Slack itself published a change-management playbook for UI rollouts, acknowledging rollout friction. — [Slack blog: change management playbook for UI rollouts](https://slack.com/blog/transformation/change-management-playbook-ui-rollouts)

**Discord (March 2025 refresh)**
- Users said spacing *within* a same-author message group increased while separators *between* different users' messages disappeared, making chat feel cluttered. — [Discord support forum: March 25, 2025 update visibility and design issues](https://support.discord.com/hc/da/community/posts/30925961190679-March-25-2025-Update-Visibility-and-Design-Issues)
- Density options did not satisfy: "each density option is still extremely small, cluttered, and overall inconsistent"; all versions feel "both too dense and too sparse" depending on the element; Cozy users found some things too compact and others awkwardly spaced. — [Discord forum: New UI Feedback 2025](https://support.discord.com/hc/da/community/posts/30939544298391--Feedback-New-UI-Feedback-2025)
- The "New Messages" line became harder to spot and easy to scroll past in a long backlog. — [Discord forum: New Discord UI (March 2025)](https://support.discord.com/hc/sv/community/posts/30928210948247-New-Discord-UI-March-2025)
- New server list criticised for looks and usability; multiple threads asked for an option to revert. — [Discord forum: new server list](https://support.discord.com/hc/ja/community/posts/30927601926807-New-server-list-on-desktop-looks-terrible-and-has-worse-usability), [Add options to undo the recent visual changes](https://support.discord.com/hc/sv/community/posts/30928501553687-Add-options-to-undo-the-recent-visual-changes)
- Dexerto reported users "revolted" and cancelled Nitro; not independently confirmed. — [Dexerto](https://jamtest.dexerto.com/entertainment/discord-announces-massive-desktop-redesign-with-tons-of-new-features-3168810)

**Docs tools**
- Coda users: default page uses about half the screen; even "Wide" is ~800-900px; a thread titled "I enjoy white space but…" (complaints led to the full-width setting). — [Coda community: doc page size is half of my screen](https://connect.superhuman.com/t/doc-page-size-is-half-of-my-screen/27892), [I enjoy white space but](https://connect.superhuman.com/t/i-enjoy-white-space-but/35822)
- Notion: no font-size control, only three typefaces, contrasted with Word/Google Docs. — [Zapier](https://zapier.com/blog/how-to-change-font-in-notion/)
- Vendor claim (Craft's own comparison page, unverified): Coda has a near-unusable mobile app, slows with large documents and has a steep formula learning curve. — [Craft: compare](https://www.craft.do/compare)

**AI assistant UIs**
- AI bolted onto existing tools tends to default to a chat sidebar instead of actions attached to content. — [Modern AI Engineer Guide: Notion AI case](https://tonyx1998.github.io/modern-ai-engineer-guide/docs/case-studies/case-notion-ai)
- Bare-input-box empty states in AI products are blamed for user drop-off. — [Feedbagel](https://feedbagel.com/post/the-death-of-the-empty-state-in-ai-products)
- Approval prompts that hide the payload are "theater"; over-prompting produces rubber-stamping. — [Kunal Ganglani](https://www.kunalganglani.com/blog/tool-approval-patterns-ai-agents), [Easton Dev](https://eastondev.com/blog/en/posts/ai/20260911-human-in-the-loop-agent-approval-design/)
- Approval rule systems are hard to make predictable (auto-approve rules not honoured). — [microsoft/vscode#324059](https://github.com/microsoft/vscode/issues/324059)
- Generic spinners that hide whether the AI is waiting, streaming, retrying or finished. — [metacto](https://www.metacto.com/blogs/ai-chat-ux-patterns-production)

### Inferences
- The Discord complaints are specifically about *relative* spacing: the gap inside a group versus the gap between groups. Message grouping reads correctly only when intra-group spacing is clearly smaller than inter-group spacing; changing one without the other breaks it.
- The unread divider is a high-stakes element: both the Discord complaints and Slack's badge incident show users notice immediately when unread signalling becomes less salient or less accurate.
- Backlash in both Slack and Discord centred on losing an existing habit with no opt-out (workspace switcher, old density). Offering density and layout as settings from the start avoids the same trap.
- Narrow reading columns are praised for prose and criticised for tables; the criticism disappears where a per-page width switch exists.

### Gaps
- No formal critique from NN/g, Smashing Magazine, UX Collective or a usability study was retrieved; evidence is forum posts, press and vendor/competitor blogs, so weight accordingly.
- No retrieved criticism specific to Microsoft Teams' unified list, Slack's 2026 Activity hub/Slackbot workspace, Notion's new sidebar, Craft or Slite.
- No retrieved criticism of Intercom Fin's or Linear's agent UI.
- Dribbble/Behance concept trends ("team chat app", "AI assistant UI", "knowledge base UI") were not reachable, so no notes on concept-work clichés.
