export interface DocumentPictureInPicture {
  requestWindow: (options: { width: number; height: number }) => Promise<Window>;
}

/** The Document Picture-in-Picture entry point, where the browser has one
 *  (Chrome and Edge 116+, Firefox 151+ on desktop; not Safari). */
export function documentPictureInPicture(scope: object = globalThis): DocumentPictureInPicture | null {
  return (scope as { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture ?? null;
}

export type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

/** A picture-in-picture window starts as a blank document: give it the
 *  page's stylesheets and the root attributes the themes hang off. */
export function adoptPageStyles(win: Window): void {
  for (const node of document.head.querySelectorAll('link[rel="stylesheet"], style')) {
    win.document.head.appendChild(node.cloneNode(true));
  }
  for (const attr of Array.from(document.documentElement.attributes)) {
    win.document.documentElement.setAttribute(attr.name, attr.value);
  }
  win.document.body.className = document.body.className;
}
