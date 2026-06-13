import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

const ALLOWED_TAGS = ["b", "i", "em", "strong", "code", "pre", "a", "blockquote", "ul", "ol", "li", "p", "br"];
const ALLOWED_ATTR = ["href", "target", "rel"];

function buildHtml(content: string): string {
  const raw = marked.parse(content) as string;
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORCE_BODY: false,
  });

  // Ensure all links open in a new tab safely.
  const div = document.createElement("div");
  div.innerHTML = clean;
  div.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  return div.innerHTML;
}

export function MessageContent({
  content,
  knownNames,
  myName,
}: {
  content: string;
  knownNames: Set<string>;
  myName: string | null;
}) {
  const html = useMemo(() => buildHtml(content), [content]);

  // Highlight @mentions by post-processing the sanitized HTML through a
  // second DOM pass so we never feed regex-built markup into innerHTML directly.
  const finalHtml = useMemo(() => {
    if (!knownNames.size && !myName) return html;
    const div = document.createElement("div");
    div.innerHTML = html;

    function walkText(node: Node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? "";
        const mentionRe = /@([\w.\-]+)/g;
        let m: RegExpExecArray | null;
        let last = 0;
        const frag = document.createDocumentFragment();
        let matched = false;
        while ((m = mentionRe.exec(text)) !== null) {
          const name = m[1].toLowerCase();
          const known = knownNames.has(name);
          if (!known) continue;
          matched = true;
          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          const span = document.createElement("span");
          const isSelf = myName !== null && name === myName.toLowerCase();
          span.className = isSelf ? "mention mention-self" : "mention";
          span.textContent = m[0];
          frag.appendChild(span);
          last = m.index + m[0].length;
        }
        if (matched) {
          if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
          node.parentNode?.replaceChild(frag, node);
        }
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        (node as Element).tagName !== "CODE" &&
        (node as Element).tagName !== "PRE"
      ) {
        Array.from(node.childNodes).forEach(walkText);
      }
    }

    Array.from(div.childNodes).forEach(walkText);
    return div.innerHTML;
  }, [html, knownNames, myName]);

  return <span className="message-md" dangerouslySetInnerHTML={{ __html: finalHtml }} />;
}
