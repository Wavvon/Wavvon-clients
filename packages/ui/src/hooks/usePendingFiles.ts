import { useCallback, useEffect, useRef, useState } from "react";

export interface PendingFile {
  file: File;
  objectUrl: string;
  asFile: boolean;
}

export interface PendingFilesState {
  files: PendingFile[];
  add: (list: FileList | null) => void;
  remove: (index: number) => void;
  toggleAsFile: (index: number) => void;
  clear: () => void;
}

export function usePendingFiles(): PendingFilesState {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const live = useRef<PendingFile[]>([]);
  live.current = files;

  useEffect(() => () => live.current.forEach((f) => URL.revokeObjectURL(f.objectUrl)), []);

  const add = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return;
    const added = Array.from(list).map((file) => ({ file, objectUrl: URL.createObjectURL(file), asFile: false }));
    setFiles((prev) => [...prev, ...added]);
  }, []);

  const remove = useCallback((index: number) => {
    setFiles((prev) => {
      if (prev[index]) URL.revokeObjectURL(prev[index].objectUrl);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const toggleAsFile = useCallback((index: number) => {
    setFiles((prev) => prev.map((f, i) => (i === index ? { ...f, asFile: !f.asFile } : f)));
  }, []);

  const clear = useCallback(() => {
    live.current.forEach((f) => URL.revokeObjectURL(f.objectUrl));
    setFiles([]);
  }, []);

  return { files, add, remove, toggleAsFile, clear };
}
