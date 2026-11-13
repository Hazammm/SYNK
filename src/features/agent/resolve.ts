// Turns the names people use in conversation ("Sarah", "done", "sprint 4") into records.
// Pure functions: an unclear name is reported as ambiguous instead of guessed.
export type Match<T> = { kind: "one"; item: T } | { kind: "many"; items: T[] } | { kind: "none" };

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function matchByName<T>(items: T[], query: string, nameOf: (item: T) => string | null): Match<T> {
  const wanted = normalize(query);
  if (!wanted) return { kind: "none" };
  const named = items.flatMap(item => { const name = nameOf(item); return name ? [{ item, name: normalize(name) }] : []; });
  // The most specific rule that matches anything decides: an exact name beats a first name, which beats a fragment.
  const rules: ((name: string) => boolean)[] = [
    name => name === wanted,
    name => name.split(" ").includes(wanted),
    name => name.startsWith(wanted),
    name => name.includes(wanted),
  ];
  for (const rule of rules) {
    const hits = named.filter(entry => rule(entry.name)).map(entry => entry.item);
    if (hits.length === 1) return { kind: "one", item: hits[0] };
    if (hits.length > 1) return { kind: "many", items: hits };
  }
  return { kind: "none" };
}

// "me" style words refer to the person talking to the agent.
export const isSelf = (value: string) => ["me", "myself", "i", "mine"].includes(normalize(value));
// Words that mean "clear this field".
export const isNone = (value: string) => ["none", "nobody", "no one", "unassigned", "backlog", "no sprint", "clear", "remove"].includes(normalize(value));
export const ticketKeyPattern = /^[A-Za-z][A-Za-z0-9]{1,9}-[1-9]\d*$/;
