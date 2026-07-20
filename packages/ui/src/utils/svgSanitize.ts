import DOMPurify from "dompurify";

// Shared sanitization for user-supplied SVG markup (hub icon library,
// channel custom icons). DOMPurify's svg/svgFilters profiles strip scripts,
// event handlers, and external references while keeping the shapes.
export function sanitizeSvgMarkup(svg: string): string {
  return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
}
