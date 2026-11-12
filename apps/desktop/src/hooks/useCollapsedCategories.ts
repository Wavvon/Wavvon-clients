import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Collapsed categories: hub_id -> { category_id: true }. Persisted so a
 *  folded category stays folded across restarts. Categories not in the
 *  map render expanded by default. */
export function useCollapsedCategories() {
  const [collapsedCategories, setCollapsedCategories] = useState<
    Record<string, Record<string, boolean>>
  >({});

  function toggleCategoryCollapsed(hubId: string, categoryId: string) {
    setCollapsedCategories((prev) => {
      const hubMap = { ...(prev[hubId] ?? {}) };
      if (hubMap[categoryId]) delete hubMap[categoryId];
      else hubMap[categoryId] = true;
      const next = { ...prev, [hubId]: hubMap };
      invoke("save_collapsed_categories", { state: next }).catch(() => {});
      return next;
    });
  }

  // Hydrate collapsed-category state on launch.
  useEffect(() => {
    invoke<Record<string, Record<string, boolean>>>("load_collapsed_categories")
      .then((s) => setCollapsedCategories(s ?? {}))
      .catch(console.error);
  }, []);

  return { collapsedCategories, toggleCategoryCollapsed };
}
