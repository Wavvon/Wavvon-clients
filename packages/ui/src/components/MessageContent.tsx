import React, { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface HubEmojiEntry { id: string; name: string; url: string; }

const ALLOWED_TAGS = [
  "b", "i", "em", "strong", "code", "pre", "a",
  "blockquote", "ul", "ol", "li", "p", "br",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

// Guarded: DOMPurify is a no-op stub without a DOM (Node test envs import
// this module transitively through the @wavvon/ui barrel).
if (typeof DOMPurify.addHook === "function") {
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

function renderMarkdown(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(raw, { ALLOWED_TAGS, ALLOWED_ATTR });
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Both substitutions below splice into the string DOMPurify already returned,
// so the sanitizer never sees what they insert. That is deliberate — allowing
// `img` in ALLOWED_TAGS so the emoji tag could be built before sanitization
// would also admit the `<img>` marked emits for `![](url)`, turning any message
// into a remote fetch from an arbitrary host. The cost is that every value
// interpolated here has to carry its own escaping: `url` and `name` are both
// hub-controlled fields from `GET /emojis`.
export function substituteHubEmojis(
  html: string,
  hubEmojiMap: Map<string, HubEmojiEntry>,
  hubBaseUrl: string,
): string {
  return html.replace(/:(?<name>[\w-]+):/g, (_match, name: string) => {
    const entry = hubEmojiMap.get(name);
    if (!entry) return _match;
    const src = escapeAttr(hubBaseUrl ? `${hubBaseUrl}${entry.url}` : entry.url);
    const label = escapeAttr(`:${entry.name}:`);
    return `<img src="${src}" alt="${label}" title="${label}" class="inline-emoji" />`;
  });
}

export function MessageContent({
  content,
  knownNames,
  myName,
  hubEmojiMap,
  hubBaseUrl,
}: {
  content: string;
  knownNames: Set<string>;
  myName: string | null;
  hubEmojiMap?: Map<string, HubEmojiEntry>;
  hubBaseUrl?: string;
}) {
  const myLower = myName?.toLowerCase() ?? null;

  const html = useMemo(() => {
    let rendered = renderMarkdown(content);

    if (hubEmojiMap && hubEmojiMap.size > 0) {
      rendered = substituteHubEmojis(rendered, hubEmojiMap, hubBaseUrl ?? "");
    }

    rendered = rendered.replace(/@([\w.-]+)/g, (_match, name: string) => {
      const lower = name.toLowerCase();
      if (!knownNames.has(lower)) return _match;
      const cls = myLower !== null && lower === myLower
        ? "mention mention-self"
        : "mention";
      return `<span class="${cls}">@${name}</span>`;
    });

    return rendered;
  }, [content, hubEmojiMap, hubBaseUrl, knownNames, myLower]);

  return (
    <span
      className="md-content"
      // eslint-disable-next-line react/no-danger -- marked output through DOMPurify; the two splices after it escape their own interpolations, see the comment above substituteHubEmojis.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
