export interface PreparedImage {
  id: string;
  name: string;
  previewUrl: string;
  mimeType: string;
  data: string; // base64 without data URL prefix
}

const GEMINI_SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('이미지 파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const originalDataUrl = await readAsDataUrl(file);

  // Normalize any browser-decodable image (including GIF/BMP/AVIF/oversized photos) to JPEG/PNG
  const resizedDataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1800;
      let { width, height } = img;
      const isSupportedNative = GEMINI_SUPPORTED_IMAGE_TYPES.has(file.type);

      if (
        isSupportedNative &&
        width <= maxDim &&
        height <= maxDim &&
        file.size <= 1.5 * 1024 * 1024
      ) {
        resolve(originalDataUrl);
        return;
      }

      const scale = Math.min(1, maxDim / Math.max(width, height));
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(originalDataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => {
      if (GEMINI_SUPPORTED_IMAGE_TYPES.has(file.type)) {
        resolve(originalDataUrl);
      } else {
        reject(new Error('지원하지 않는 이미지 형식입니다. JPG, PNG 또는 WebP 이미지를 올려 주세요.'));
      }
    };
    img.src = originalDataUrl;
  });

  const match = /^data:([^;]+);base64,(.+)$/.exec(resizedDataUrl);
  if (!match) {
    throw new Error('이미지 형식을 변환할 수 없습니다.');
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || '캡처 이미지',
    previewUrl: resizedDataUrl,
    mimeType: match[1],
    data: match[2],
  };
}
