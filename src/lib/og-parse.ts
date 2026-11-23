const MAX_META = 400;

function attr(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"))
    ?? tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .slice(0, MAX_META);
}

export type OgPreview = { title: string; description: string; imageUrl: string | null; siteName: string };

export function parseOpenGraph(html: string, pageUrl: string): OgPreview {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const props = new Map<string, string>();
  for (const tag of tags) {
    const property = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
    const content = attr(tag, "content");
    if (property && content) props.set(property, decode(content));
  }
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
  const image = props.get("og:image") || props.get("twitter:image") || "";
  let imageUrl: string | null = null;
  if (image) {
    try { imageUrl = new URL(image, pageUrl).href.slice(0, 2000); } catch { imageUrl = null; }
  }
  return {
    title: (props.get("og:title") || props.get("twitter:title") || decode(titleTag)).slice(0, MAX_META),
    description: (props.get("og:description") || props.get("description") || props.get("twitter:description") || "").slice(0, MAX_META),
    imageUrl,
    siteName: (props.get("og:site_name") || "").slice(0, 80),
  };
}
