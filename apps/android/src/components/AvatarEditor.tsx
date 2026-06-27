import { ImagePicker } from "./ImagePicker";
import { Avatar } from "@wavvon/ui";

export function AvatarEditor({
  value,
  onChange,
  fallbackName,
}: {
  value: string;
  onChange: (v: string) => void;
  fallbackName: string;
}) {
  return (
    <div className="avatar-editor">
      <Avatar src={value} name={fallbackName} size={72} />
      <ImagePicker
        onPick={onChange}
        onClear={() => onChange("")}
        hasValue={!!value}
        buttonLabel="Pick image"
      />
    </div>
  );
}
