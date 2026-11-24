# Accessibility statement

Synk should be usable by everyone on the team, including people who use a keyboard, a screen reader, zoom, or a phone.

## Our goal

We aim to meet the [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) at level **AA**. The rules we follow are listed in [docs/design/design-system.md](docs/design/design-system.md#interaction-and-accessibility-rules).

## What we do today

- **Keyboard.** Every control can be reached and used with a keyboard and shows a visible focus ring. Dialogs keep focus inside, close with Escape, and return focus to the control that opened them. In chat, the message list is one Tab stop, the arrow keys move between messages, and Tab reaches a message's actions. Board cards can be moved with the keyboard. Ctrl+K (⌘K on a Mac) opens a quick switcher.
- **Screen readers.** Pages use headings, landmarks and labelled controls. Icon-only buttons have names, loading states have text labels, and live regions announce new chat messages. Unread items and online status have hidden text, so they are not shown by colour alone.
- **Seeing and reading.** There are light and dark themes. Body and muted text meet 4.5:1 contrast, and form field borders meet 3:1. Online is a filled dot and offline a hollow ring. The usage chart has a written summary.
- **Phones and zoom.** The layout works from 375px wide with no sideways scrolling. Buttons are 44px on touch screens, and fields use 16px text so phones do not zoom in on focus.
- **Motion.** All animation turns off when "reduce motion" is set on your device.
- **Testing.** Automated browser tests cover keyboard-only use, dialog focus, and the layout at phone width.

## Supported environments

- **Browsers:** the latest versions of Chrome, Edge, Firefox and Safari.
- **Systems:** Windows, macOS, Android and iOS.
- **Assistive technology:** tested with keyboard-only use. NVDA (Windows) and VoiceOver (macOS and iOS) are the screen readers we aim to support.

## Known limitations

We know about these and plan to fix them:

- The navigation rail uses 11px labels and 10px badge numbers, below our 12px minimum. White text on the red unread badge and on the active rail item is just under the 4.5:1 contrast target.
- Huddles are audio-only and have no live captions.
- Link previews show titles, descriptions and images from other websites, which may not be accessible.
- The rich-text message editor relies on the screen-reader support of the editor library (Tiptap). Some formatting may not be announced.
- Synk has not yet been audited by an independent accessibility tester or by disabled users.

## Report a barrier

If something in Synk is hard or impossible for you to use, please tell us:

- Open an issue with the **Bug report** template and start the title with `[a11y]`. Include the page, what you tried, the browser, and any assistive technology you use.
- If you would rather not post publicly, email a maintainer through the address on their GitHub profile.

We aim to reply within **5 working days**, and treat barriers that block someone from using a feature as high priority.
