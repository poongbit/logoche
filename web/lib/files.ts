export function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const MAX_LOGO_SIDE = 1600;

/** 로고를 PNG data URL로 바꾼다. 이미지 API와 엔진은 SVG를 읽지 못하고, 큰 사진은 요청을 무겁게 한다.
 * SVG는 가장 긴 변을 1600px로 그리고, 그보다 큰 사진만 줄인다. 해시는 원본 파일로 따로 잰다. */
export async function toLogoDataUrl(blob: Blob): Promise<string> {
  const dataUrl = await readAsDataUrl(blob);
  const isSvg = blob.type === "image/svg+xml";
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const width = image.naturalWidth || 800;
  const height = image.naturalHeight || 400;
  const longest = Math.max(width, height);
  if (!isSvg && longest <= MAX_LOGO_SIDE) return dataUrl;
  const scale = MAX_LOGO_SIDE / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
