const MAX_SVG_BYTES = 50 * 1024;

export function sanitizeSvg(text: string): string | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "image/svg+xml");
    if (doc.querySelector("parsererror")) return null;
    const svgEl = doc.documentElement;
    if (svgEl.tagName.toLowerCase() !== "svg") return null;

    svgEl.querySelectorAll("script,foreignObject,iframe,use,image").forEach((el) => el.remove());

    function clean(el: Element) {
      const remove: string[] = [];
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
          remove.push(attr.name);
        } else if (
          (name === "href" || name === "xlink:href" || name === "src") &&
          attr.value &&
          !attr.value.startsWith("#") &&
          !attr.value.startsWith("data:")
        ) {
          remove.push(attr.name);
        }
      }
      remove.forEach((n) => el.removeAttribute(n));
      for (const child of Array.from(el.children)) clean(child);
    }
    clean(svgEl);

    const result = new XMLSerializer().serializeToString(svgEl);
    if (result.length > MAX_SVG_BYTES) return null;
    return result;
  } catch {
    return null;
  }
}
