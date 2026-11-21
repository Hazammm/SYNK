# Synk design system

This document describes the visual system the interface is built on and how to extend it. The research behind the direction is in [research-report.md](research-report.md).

## Direction

Calm, dense and border-led. Chrome stays quiet so the content (tickets, messages, pages, hours) carries the screen.

- **Neutrals** lean slightly green so they sit with the accent.
- **Primary actions are ink**: near-black on light, near-white on dark.
- **Jade is the one accent.** It marks state (active, selected, running, in sync), not decoration.
- **Status colours are separate from the accent**: done (green), medium (amber), high (red), info (blue).
- **Ticket keys are the signature detail.** A key such as `SYN-128` is always set in the mono face, wherever it appears.

## Where things live

| File | What it holds |
|---|---|
| `src/app/globals.css` | All tokens for both themes, base element styles, switches, selects, shared keyframes |
| `src/lib/theme.ts` | Theme names, the before-paint script and the `useTheme` hook |
| `src/components/Synk.module.css` | App shell (sidebar, top bar, drawer) and primitives |
| `src/components/Primitives.tsx` | `Button`, `Badge`, `Avatar`, `Card`, `Input`, `Skeleton` |
| `src/components/Logo.tsx`, `src/app/icon.svg` | The mark and wordmark |
| `src/components/Status.tsx` | Page loading and not-found panels |
| `src/components/Auth.module.css`, `AuthAside.tsx` | Sign-in, reset, invitation and wizard pages |
| `src/components/ProductPeek.tsx` | Product illustrations used on the landing and auth pages |
| `src/features/landing/` | The public landing page |
| `src/features/*/*.module.css` | One stylesheet per feature, built only from tokens |

## Tokens

### Colour

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f9f8` | `#0f1110` | App canvas |
| `--surface` | `#ffffff` | `#161918` | Cards, panels, sidebar |
| `--raised` | `#ffffff` | `#1c201e` | Menus, dialogs, popovers |
| `--sunken` | `#f1f4f2` | `#121514` | Board columns, wells, code |
| `--fill` / `--fill-strong` | `#eef1ef` / `#e2e7e4` | `#212523` / `#2b302e` | Hover, selected, tracks |
| `--border` / `--border-strong` | `#e3e7e4` / `#c7cec9` | `#262b28` / `#3c433f` | Hairlines and dividers |
| `--field-border` | `#878f8b` | `#6f7873` | Inputs, selects and the composer: at least 3:1 against their background |
| `--text` / `--muted` / `--faint` | `#19201d` / `#5d6662` / `#656e69` | `#eceeed` / `#9ea6a2` / `#858e8a` | Text levels |
| `--ink` / `--on-ink` | `#19201d` / `#ffffff` | `#eceeed` / `#0f1110` | Primary buttons |
| `--accent` / `--accent-text` / `--accent-soft` | `#17785f` / `#136b55` / `#e2f4ed` | `#2fb891` / `#4fcfa9` / `#10291f` | Accent fill, accent text, accent tint |
| `--done`, `--medium`, `--high`, `--info` (+ `-soft`) | see `globals.css` | see `globals.css` | Status text and tints |

Every text pairing used in the interface meets WCAG AA (4.5:1) in both themes; the measured ratios are in the QA section below.

### Type

- **UI face:** Geist. **Mono face:** Geist Mono (ticket keys, timers, keyboard hints).
- **Scale:** 11, 12, 13, 14, 16, 20, 24, 32 px (`--t-xs` to `--t-3xl`). 13 px is the working size for dense UI, 14 px for body, 16 px for long-form pages.
- **Weights:** 400, 500 and 600 only.

### Shape, space and motion

- **Radius:** 4, 6, 8, 12, 16 px (`--r-xs` to `--r-xl`) and a pill. Controls use 8, cards 12, dialogs 16.
- **Space:** a 4 px grid (`--s-1` to `--s-12`).
- **Elevation:** borders first. Shadows (`--shadow-sm/md/lg`) are reserved for things that float.
- **Motion:** 100, 160 and 240 ms (`--d-fast/base/slow`) with `--ease` and `--ease-out`. Everything is disabled under `prefers-reduced-motion`.

## Components

| Component | Variants and states |
|---|---|
| Button | `primary` (ink), `secondary` (bordered), `quiet` (text). Hover, pressed (scale .98), disabled, focus ring |
| Badge | `neutral`, `done`, `medium`, `high`, `action`. Tinted fill, no border |
| Avatar | 32 px and 24 px. Six tints chosen from the initials so a person keeps one colour |
| Input, select, textarea | Hover border, focus ring (accent border plus 3 px tint), disabled and read-only fills |
| Switch | Native checkbox with `role="switch"`, styled globally |
| Dialog and drawer | Native `<dialog>`: focus trap, Escape to close, slide or pop animation |
| Empty state | Icon tile, title, one line of help, one action |
| Loading | Spinner with text (`PageLoading`) or `Skeleton` lines |
| Error | Tinted red panel with a retry button where retry is possible |

## Layout

- **Shell:** a 248 px sidebar (collapsible to a 60 px icon rail, remembered per browser) and a 52 px top bar holding search (Ctrl K), Ask Synk AI, theme, alerts, settings and the profile menu.
- **Below 1000 px** the sidebar becomes a drawer opened from the top bar. **Below 640 px** the top bar keeps only menu, search, AI, alerts and profile.
- **Chat and Docs** fill the window under the top bar; other screens sit in a padded column up to 1320 px wide.

## Themes

Two themes: `light` and `dark`. The choice is saved in `localStorage` under `synk-theme`; with nothing saved, the system setting decides. Values saved by the earlier four-theme build map onto the two (black and forest to dark, white and lavender to light).

## QA record

- `npm run lint`, `npm run typecheck`, `npm test` (39), `npm run test:integration` (106), `npm run test:e2e` (8) and `npm run build` all pass.
- Every page was captured at 1440, 820 and 390 px wide in both themes with no console errors and no horizontal page scroll.
- Contrast (WCAG 2.1): body text 15.7:1 light and 16.3:1 dark; muted text at least 5.2:1; faint text at least 4.4:1; accent text at least 5.6:1; status text on its tint at least 4.8:1.
- Field borders use `--field-border`: 3.3:1 on the light surface and 3.6:1 or more on dark surfaces, meeting WCAG 1.4.11 for control boundaries (the earlier `--border-strong` borders were 1.6:1).
