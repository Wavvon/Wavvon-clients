import { useEffect, useSyncExternalStore, type CSSProperties, type ReactElement } from "react";
import { mimeOf } from "./mime";
import type { PackageFiles } from "./packageFormat";

// The active theme's icon overrides, as object URLs. A module-level store
// rather than a context: one theme is active per document, and icons are
// rendered from hundreds of places that no provider reaches cheaply.

let urls: Record<string, string> = {};
const listeners = new Set<() => void>();

export function setThemeIcons(next: Record<string, string>): void {
  urls = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useThemedIcon(
  name: string,
  size: number,
  opts: { off?: boolean; style?: CSSProperties } = {},
): ReactElement | null {
  const url = useSyncExternalStore(subscribe, () => urls[name], () => urls[name]);
  if (!url) return null;
  // Rendered as an image, never inlined: inline SVG can run script.
  const img = (
    <img src={url} width={size} height={size} alt="" aria-hidden="true" className="themed-icon" style={opts.style} />
  );
  return opts.off ? <span className="themed-icon-wrap themed-icon-off">{img}</span> : img;
}

export function useActiveThemeIcons(icons: Record<string, string> | undefined, files: PackageFiles | undefined): void {
  useEffect(() => {
    const made: string[] = [];
    const map: Record<string, string> = {};
    for (const [name, path] of Object.entries(icons ?? {})) {
      const bytes = files?.[path];
      if (!bytes) continue;
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(path) }));
      made.push(url);
      map[name] = url;
    }
    setThemeIcons(map);
    return () => {
      setThemeIcons({});
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [icons, files]);
}
