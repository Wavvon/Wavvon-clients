import { useEffect, useState } from "react";
import { mimeOf } from "./mime";

export function useBlobUrl(bytes: Uint8Array | undefined, path: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!bytes || !path) {
      setUrl(undefined);
      return;
    }
    const u = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeOf(path) }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes, path]);
  return url;
}
