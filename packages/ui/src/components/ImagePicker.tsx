import { useState } from "react";

/**
 * Drop-zone + button file picker. Resizes the chosen image (center-crop) to
 * a JPEG data URL before handing it back, so the payload stays small
 * regardless of what the user drags in. Defaults to 128×128 (avatars); pass
 * width/height for other aspects (e.g. a wide profile cover).
 */
export function ImagePicker({
  onPick,
  onClear,
  hasValue,
  buttonLabel,
  width = 128,
  height = 128,
  quality = 0.85,
}: {
  onPick: (dataUrl: string) => void;
  onClear: () => void;
  hasValue: boolean;
  buttonLabel: string;
  width?: number;
  height?: number;
  quality?: number;
}) {
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("Pick an image file");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("Image too large (max 10 MB)");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      // Center-crop: scale so the image covers the target box, then center.
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
      onPick(canvas.toDataURL("image/jpeg", quality));
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      alert("Could not load image — try a different file.");
      URL.revokeObjectURL(objectUrl);
    };
    img.src = objectUrl;
  }

  return (
    <div
      className={`image-picker ${dragOver ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        if (!dragOver) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
      }}
    >
      <label className="btn-secondary image-picker-button">
        {buttonLabel}
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </label>
      <span className="muted image-picker-hint">or drop an image here</span>
      {hasValue && (
        <button type="button" onClick={onClear} className="btn-secondary">
          Clear
        </button>
      )}
    </div>
  );
}
