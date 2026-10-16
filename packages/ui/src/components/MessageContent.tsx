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

// Emoji and mentions are added after DOMPurify, so the sanitizer never sees
// what they insert. That is deliberate — allowing `img` in ALLOWED_TAGS would
// also admit the `<img>` marked emits for `![](url)`, turning any message into
// a remote fetch from an arbitrary host. So the decoration works on the parsed
// tree, never on the HTML string: it only replaces text nodes, and builds what
// it inserts with DOM calls. The string splice it replaces also rewrote
// `:name:` and `@name` inside attribute values — a link's href — where the
// inserted markup broke the attribute open.
const TOKEN = /:([\w-]+):|@([\w.-]+)/g;

/** An emoji `src` is only ever an http(s) URL; anything else stays text. */
function emojiSrc(entry: HubEmojiEntry, hubBaseUrl: string): string | null {
  const src = hubBaseUrl ? `${hubBaseUrl}${entry.url}` : entry.url;
  try {
    const { protocol } = new URL(src, document.baseURI);
    return protocol === "http:" || protocol === "https:" ? src : null;
  } catch {
    return null;
  }
}

export function decorateMessageHtml(
  html: string,
  opts: {
    hubEmojiMap?: Map<string, HubEmojiEntry>;
    hubBaseUrl?: string;
    knownNames: Set<string>;
    myLower: string | null;
  },
): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);

  for (const text of texts) {
    if (text.parentElement?.closest("code, pre")) continue;
    const data = text.data;
    const out = document.createDocumentFragment();
    let last = 0;
    for (const m of data.matchAll(TOKEN)) {
      let node: Node | null = null;
      if (m[1] !== undefined) {
        const entry = opts.hubEmojiMap?.get(m[1]);
        const src = entry ? emojiSrc(entry, opts.hubBaseUrl ?? "") : null;
        if (entry && src) {
          const img = document.createElement("img");
          img.setAttribute("src", src);
          img.setAttribute("alt", `:${entry.name}:`);
          img.setAttribute("title", `:${entry.name}:`);
          img.className = "inline-emoji";
          node = img;
        }
      } else {
        const lower = m[2].toLowerCase();
        if (opts.knownNames.has(lower)) {
          const span = document.createElement("span");
          span.className = opts.myLower === lower ? "mention mention-self" : "mention";
          span.textContent = `@${m[2]}`;
          node = span;
        }
      }
      if (!node) continue;
      out.append(data.slice(last, m.index), node);
      last = m.index + m[0].length;
    }
    if (last === 0) continue;
    out.append(data.slice(last));
    text.replaceWith(out);
  }
  return tpl.innerHTML;
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

  const html = useMemo(
    () => decorateMessageHtml(renderMarkdown(content), { hubEmojiMap, hubBaseUrl, knownNames, myLower }),
    [content, hubEmojiMap, hubBaseUrl, knownNames, myLower],
  );

  return (
    <span
      className="md-content"
      // eslint-disable-next-line react/no-danger -- marked output through DOMPurify; emoji and mentions are added as DOM nodes on text only, see decorateMessageHtml.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
