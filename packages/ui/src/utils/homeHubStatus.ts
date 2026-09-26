export interface HomeHubStatus {
  isHomeHub: boolean;
  isLast: boolean;
}

/** Is `hubUrl` in this designation, and is it the only entry?
 *
 *  The list stores addresses as strings and every consumer compares them as
 *  strings, so two spellings of one hub are two hubs — the trailing slash has
 *  already cost a bug here once (home-hub.md, "A hub's address is part of the
 *  synced state"). Normalise both sides the same way the designation itself is
 *  written, and nowhere else.
 *
 *  An empty list is a designation the user emptied on purpose: not a home hub,
 *  and nothing is "last". */
export function homeHubStatus(designationHubs: string[], hubUrl: string): HomeHubStatus {
  const strip = (u: string) => u.trim().replace(/\/+$/, "");
  const url = strip(hubUrl);
  if (!url) return { isHomeHub: false, isLast: false };
  const listed = designationHubs.map(strip).filter(Boolean);
  const isHomeHub = listed.includes(url);
  return { isHomeHub, isLast: isHomeHub && listed.length === 1 };
}
