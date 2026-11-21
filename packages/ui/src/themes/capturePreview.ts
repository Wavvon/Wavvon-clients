import { PREVIEW_HEIGHT, PREVIEW_WIDTH } from "./demoContent";

async function blobUrlToDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

// An SVG drawn as an image cannot read the page's stylesheet or any blob: URL,
// so every element carries its resolved style and every image is inlined.
// Pseudo-elements and web fonts do not survive; the preview is an
// approximation of the theme, not a screenshot.
function inlineStyles(source: Element, copy: Element): void {
  const cs = getComputedStyle(source);
  let css = "";
  for (const prop of cs) css += `${prop}:${cs.getPropertyValue(prop)};`;
  (copy as HTMLElement).setAttribute("style", css);
  for (let i = 0; i < source.children.length; i++) inlineStyles(source.children[i], copy.children[i]);
}

async function inlineImages(root: HTMLElement): Promise<void> {
  const imgs = [...root.querySelectorAll("img")];
  await Promise.all(
    imgs.map(async (img) => {
      if (img.src.startsWith("blob:")) img.src = await blobUrlToDataUrl(img.src);
    }),
  );
}

/** Renders `node` (the demo view) with the active theme to a WebP, or a PNG
 *  where the browser cannot encode WebP. */
export async function captureNode(node: HTMLElement): Promise<Blob> {
  const wrapper = document.createElement("div");
  wrapper.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  wrapper.style.cssText = `width:${PREVIEW_WIDTH}px;height:${PREVIEW_HEIGHT}px;position:relative;overflow:hidden;`;

  // The theme's background image sits behind the app in a fixed layer; the
  // demo's own translucent panels let it show through here too.
  const layer = document.getElementById("theme-bg");
  if (layer) {
    const ls = getComputedStyle(layer);
    let image = ls.backgroundImage;
    const m = image.match(/url\("?(blob:[^")]+)"?\)/);
    if (m) image = image.replace(m[1], await blobUrlToDataUrl(m[1]));
    wrapper.style.backgroundColor = ls.backgroundColor;
    wrapper.style.backgroundImage = image;
    wrapper.style.backgroundSize = ls.backgroundSize;
    wrapper.style.backgroundRepeat = ls.backgroundRepeat;
    wrapper.style.backgroundPosition = "center";
  } else {
    wrapper.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue("--bg");
  }

  const copy = node.cloneNode(true) as HTMLElement;
  inlineStyles(node, copy);
  await inlineImages(copy);
  wrapper.appendChild(copy);

  const xhtml = new XMLSerializer().serializeToString(wrapper);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}"><foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`;
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not render the preview"));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_WIDTH;
  canvas.height = PREVIEW_HEIGHT;
  canvas.getContext("2d")!.drawImage(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the preview"))), "image/webp", 0.9),
  );
}
