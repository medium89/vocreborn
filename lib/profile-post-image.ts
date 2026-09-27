export const PROFILE_POST_IMAGE_MAX_BYTES = 100 * 1024;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
const MAX_EDGE = 1600;
const outputEdges = [1600, 1280, 960, 720, 540, 400, 300, 220, 160];
const qualities = [0.82, 0.7, 0.58, 0.46, 0.34, 0.24];

function encodeWebp(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob?.type === "image/webp" ? resolve(blob) : reject(new Error("Браузер не поддерживает сжатие в WebP")), "image/webp", quality);
  });
}

export async function prepareProfilePostImage(file: File): Promise<File> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Для записи подходят PNG, JPEG и WebP");
  }
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Исходное изображение должно быть не больше 30 МБ");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Не удалось открыть изображение. Попробуйте другой файл");
  }

  try {
    const largestEdge = Math.max(bitmap.width, bitmap.height);
    if (file.size <= PROFILE_POST_IMAGE_MAX_BYTES && largestEdge <= MAX_EDGE) return file;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Браузер не поддерживает обработку изображений");

    const edges = outputEdges.map((value) => Math.min(value, largestEdge)).filter((value, index, values) => values.indexOf(value) === index);
    for (const edge of edges) {
      const scale = Math.min(1, edge / largestEdge);
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.imageSmoothingQuality = "high";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of qualities) {
        const blob = await encodeWebp(canvas, quality);
        if (blob.size <= PROFILE_POST_IMAGE_MAX_BYTES) {
          const name = file.name.replace(/\.[^.]+$/, "") + ".webp";
          return new File([blob], name, { type: "image/webp" });
        }
      }
    }
    throw new Error("Не удалось уменьшить изображение до 100 КБ. Выберите другое фото");
  } finally {
    bitmap.close();
  }
}
