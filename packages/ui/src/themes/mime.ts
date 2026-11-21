const MIME: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  svg: "image/svg+xml",
};

export function mimeOf(path: string): string {
  return MIME[path.slice(path.lastIndexOf(".") + 1).toLowerCase()] ?? "application/octet-stream";
}
