// How a member arranges their hubs in the top bar: folders of hubs, and an
// ordered list of what is pinned as a tab (hub ids and folder ids). Personal
// state: it rides the synced settings, never a hub.

export interface HubFolder {
  id: string;
  name: string;
  hubs: string[];
}

export interface HubLayout {
  folders: HubFolder[];
  /** Tab order; each entry is a hub id or a folder id. */
  pinned: string[];
}

export const EMPTY_LAYOUT: HubLayout = { folders: [], pinned: [] };

/** A stored layout, or the empty one when it is missing or malformed. */
export function parseLayout(raw: string | null): HubLayout {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<HubLayout> | null;
    if (!v || !Array.isArray(v.folders) || !Array.isArray(v.pinned)) return EMPTY_LAYOUT;
    const folders = v.folders
      .filter((f): f is HubFolder => !!f && typeof f.id === "string" && typeof f.name === "string" && Array.isArray(f.hubs))
      .map((f) => ({ id: f.id, name: f.name, hubs: f.hubs.filter((h) => typeof h === "string") }));
    return { folders, pinned: v.pinned.filter((p) => typeof p === "string") };
  } catch {
    return EMPTY_LAYOUT;
  }
}

/** Drops hubs this account no longer has, and folders and pins left pointing nowhere. */
export function pruneLayout(layout: HubLayout, hubIds: string[]): HubLayout {
  const known = new Set(hubIds);
  const folders = layout.folders.map((f) => ({ ...f, hubs: f.hubs.filter((h) => known.has(h)) }));
  const folderIds = new Set(folders.map((f) => f.id));
  const pinned = layout.pinned.filter((p) => known.has(p) || folderIds.has(p));
  const same = pinned.length === layout.pinned.length &&
    folders.every((f, i) => f.hubs.length === layout.folders[i].hubs.length);
  return same ? layout : { folders, pinned };
}

export function folderOf(layout: HubLayout, hubId: string): HubFolder | undefined {
  return layout.folders.find((f) => f.hubs.includes(hubId));
}

export function isPinned(layout: HubLayout, id: string): boolean {
  return layout.pinned.includes(id);
}

export function togglePin(layout: HubLayout, id: string): HubLayout {
  return {
    ...layout,
    pinned: isPinned(layout, id) ? layout.pinned.filter((p) => p !== id) : [...layout.pinned, id],
  };
}

export function createFolder(layout: HubLayout, name: string, id: string): HubLayout {
  return { ...layout, folders: [...layout.folders, { id, name, hubs: [] }] };
}

export function deleteFolder(layout: HubLayout, folderId: string): HubLayout {
  return {
    folders: layout.folders.filter((f) => f.id !== folderId),
    pinned: layout.pinned.filter((p) => p !== folderId),
  };
}

/** Moves a hub into a folder (null takes it out of any). A hub that goes into
 *  a folder loses its own tab: the folder's tab now speaks for it. */
export function moveHubToFolder(layout: HubLayout, hubId: string, folderId: string | null): HubLayout {
  const folders = layout.folders.map((f) => {
    const without = f.hubs.filter((h) => h !== hubId);
    return f.id === folderId ? { ...f, hubs: [...without, hubId] } : { ...f, hubs: without };
  });
  return { folders, pinned: folderId ? layout.pinned.filter((p) => p !== hubId) : layout.pinned };
}

export function movePinned(layout: HubLayout, fromId: string, toId: string): HubLayout {
  const from = layout.pinned.indexOf(fromId);
  const to = layout.pinned.indexOf(toId);
  if (from < 0 || to < 0 || from === to) return layout;
  const pinned = [...layout.pinned];
  pinned.splice(to, 0, pinned.splice(from, 1)[0]);
  return { ...layout, pinned };
}

/** Where a hub's notifications are counted: its own tab when pinned, else its
 *  folder's tab when that is pinned, else null — the "Hubs" button. */
export function badgeHome(layout: HubLayout, hubId: string): string | null {
  if (isPinned(layout, hubId)) return hubId;
  const folder = folderOf(layout, hubId);
  return folder && isPinned(layout, folder.id) ? folder.id : null;
}

export interface Badge {
  count: number;
  mention: boolean;
}

/** Each notification counted in exactly one place: a pinned tab or the rest. */
type Counts = Record<string, number>;
type Flags = Record<string, boolean>;

export function tabBadges(layout: HubLayout, hubIds: string[], unreadByHub: Counts, mentionByHub: Flags): { tabs: Record<string, Badge>; rest: Badge } {
  const tabs: Record<string, Badge> = {};
  const rest: Badge = { count: 0, mention: false };
  for (const h of hubIds) {
    const count = unreadByHub[h] ?? 0;
    if (count === 0) continue;
    const home = badgeHome(layout, h);
    const b = home ? (tabs[home] ??= { count: 0, mention: false }) : rest;
    b.count += count;
    b.mention ||= !!mentionByHub[h];
  }
  return { tabs, rest };
}
