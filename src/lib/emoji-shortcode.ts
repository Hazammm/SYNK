// Custom emoji shortcodes: :party-parrot: → party-parrot. Letters, digits and hyphens, 2–32 chars.

export const SHORTCODE_PATTERN = /^[a-z][a-z0-9-]{0,30}[a-z0-9]$/;
export const SHORTCODE_IN_TEXT = /:([a-z][a-z0-9-]{0,30}[a-z0-9]):/g;

export function normalizeShortcode(value: string) {
  return value.trim().toLowerCase().replace(/^:|:$/g, "");
}

export function isValidShortcode(value: string) {
  return SHORTCODE_PATTERN.test(normalizeShortcode(value));
}

export function wrapShortcode(value: string) {
  const shortcode = normalizeShortcode(value);
  return `:${shortcode}:`;
}

export function isCustomReaction(emoji: string) {
  return /^:[a-z][a-z0-9-]{0,30}[a-z0-9]:$/.test(emoji);
}
