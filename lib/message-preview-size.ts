import type { CSSProperties } from "react";

export function messagePreviewStyle(value: string): CSSProperties {
  const lines = value.split("\n");
  const columns = Math.max(24, Math.min(72, ...lines.map((line) => line.length)));
  const visualLines = lines.reduce((count, line) => count + Math.max(1, Math.ceil(line.length / columns)), 0);
  return {
    "--preview-width": Math.max(300, Math.min(680, columns * 8 + 38)) + "px",
    "--preview-height": Math.max(66, Math.min(410, visualLines * 22 + 26)) + "px",
  } as CSSProperties;
}
