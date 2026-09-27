type AvatarProps = {
  value?: string | null;
  name: string;
  className?: string;
  previewUrl?: string | null;
  previewHint?: string;
};

export function Avatar({ value, name, className = "", previewUrl, previewHint }: AvatarProps) {
  const image = value?.startsWith("http://") || value?.startsWith("https://");
  const preview = previewUrl?.startsWith("http://") || previewUrl?.startsWith("https://");
  return (
    <span className={"avatar " + className}>
      {image ? <img src={value ?? undefined} alt="" /> : value || name[0]?.toUpperCase() || "?"}
      {preview && <span className={"avatar-preview" + (previewHint ? " has-hint" : "")} aria-hidden="true"><img src={previewUrl ?? undefined} alt="" />{previewHint && <span className="avatar-preview-hint">{previewHint}</span>}</span>}
    </span>
  );
}
