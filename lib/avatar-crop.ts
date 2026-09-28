export type AvatarCrop = { x: number; y: number; zoom: number };

export function avatarCropRectangle(width: number, height: number, crop: AvatarCrop) {
  const size = Math.min(width, height) / Math.max(1, Math.min(4, crop.zoom));
  const clamp = (value: number) => Math.max(0, Math.min(100, value));
  return { x: (width - size) * clamp(crop.x) / 100, y: (height - size) * clamp(crop.y) / 100, size };
}

export async function encodeAvatarCrop(image: HTMLImageElement, crop: AvatarCrop): Promise<File> {
  const rect = avatarCropRectangle(image.naturalWidth, image.naturalHeight, crop);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Браузер не поддерживает обработку изображений");
  for (const edge of [512, 400, 320, 240]) {
    canvas.width = edge; canvas.height = edge;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, rect.x, rect.y, rect.size, rect.size, 0, 0, edge, edge);
    for (const quality of [.9, .8, .7, .6, .45]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") throw new Error("Не удалось обработать фото в WebP");
      if (blob.size <= 100 * 1024) return new File([blob], "avatar.webp", { type: "image/webp" });
    }
  }
  throw new Error("Не удалось сжать аватар до 100 КБ. Выберите другое фото");
}
