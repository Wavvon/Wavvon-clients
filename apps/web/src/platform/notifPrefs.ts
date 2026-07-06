import type { NotifLevel } from "@shared/types";

function key(hubUrl: string): string {
  return `wavvon.notif.${hubUrl}`;
}

export function getNotifPref(hubUrl: string): NotifLevel {
  try {
    const raw = localStorage.getItem(key(hubUrl));
    if (raw === "all" || raw === "mentions" || raw === "none") return raw;
  } catch {
    // storage unavailable
  }
  return "all";
}

export function setNotifPref(hubUrl: string, level: NotifLevel): void {
  try {
    localStorage.setItem(key(hubUrl), level);
  } catch {
    // storage unavailable
  }
}
