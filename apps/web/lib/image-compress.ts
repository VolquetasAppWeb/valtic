// Las fotos de camara de celular suelen pesar varios MB a resolucion
// completa (3000-4000px+), pero para lectura de texto (cedula, licencia,
// tarjeta de propiedad, vales) esa resolucion extra no aporta nada — Gemini
// ya reduce internamente la imagen antes de "leerla", asi que solo se
// traduce en mas tiempo de subida y de procesamiento. Comprimir aqui antes
// de enviar acelera la extraccion por IA sin perder legibilidad: 1920px en
// el lado mas largo es de sobra para que cualquier texto impreso en un
// documento de identidad se siga leyendo perfecto.
const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.85;
// Si el archivo ya es chico, comprimir de mas no ayuda y solo arriesga
// perder calidad en fotos que un usuario ya subio optimizadas.
const SKIP_IF_SMALLER_THAN_BYTES = 600_000;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SKIP_IF_SMALLER_THAN_BYTES) {
    return file;
  }

  try {
    // "from-image" respeta la orientacion EXIF (fotos de celular en
    // vertical no deben quedar giradas al comprimir).
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) {
      // La compresion no ayudo (foto ya eficiente) — mejor quedarse con la original.
      return file;
    }

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    // Si algo falla (navegador sin soporte, imagen corrupta), se sube la
    // original tal cual — nunca bloquear el flujo por un error de compresion.
    return file;
  }
}
