import { useState } from "react";

/**
 * Drop-zone + button file picker. Resizes the chosen image to 128×128 JPEG
 * (center-crop, quality 0.85) before handing back a data URL. Keeps the
 * payload small regardless of what the user drags in. Shared between the
 * avatar and hub-icon editors.
 */
export function ImagePicker({
  onPick,
  onClear,
  hasValue,
  buttonLabel,
}: {
  onPick: (dataUrl: string) => void;
  onClear: () => void;
  hasValue: boolean;
  buttonLabel: string;
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
      const SIZE = 128;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d")!;
      // Center-crop: scale so the shorter side fills the square
      const scale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
      const w = img.naturalWidth * scale;
      const h = img.naturalHeight * scale;
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      onPick(canvas.toDataURL("image/jpeg", 0.85));
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
        <button onClick={onClear} className="btn-secondary">
          Clear
        </button>
      )}
    </div>
  );
}
