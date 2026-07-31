export const PNG_PDF_MIMES = new Set(['image/png', 'application/pdf']);
export const IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);
export const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
export const MAX_PNG_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES;

export function assertPngOrPdf(mime: string, size: number): void {
  if (!PNG_PDF_MIMES.has(mime)) {
    throw new Error('Only PNG and PDF are allowed');
  }
  if (size > MAX_PNG_PDF_BYTES) {
    throw new Error('File exceeds 20 MB limit');
  }
}

export function assertEventMaterial(mime: string, size: number): void {
  const isImage = IMAGE_MIMES.has(mime);
  const isPdf = mime === 'application/pdf';
  const isVideo = VIDEO_MIMES.has(mime);
  if (!isImage && !isPdf && !isVideo) {
    throw new Error('Allowed: PNG, JPEG, WebP, PDF, MP4, WebM, MOV');
  }
  if (isVideo && size > MAX_VIDEO_BYTES) {
    throw new Error('Video exceeds 200 MB limit');
  }
  if ((isImage || isPdf) && size > MAX_PNG_PDF_BYTES) {
    throw new Error('File exceeds 20 MB limit');
  }
}

const COURSE_DOC_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

/** Public catalog materials: images, PDF, office docs (no video — promo is separate). */
export function assertCourseMaterial(mime: string, size: number): void {
  const isImage = IMAGE_MIMES.has(mime);
  const isDoc = COURSE_DOC_MIMES.has(mime);
  if (!isImage && !isDoc) {
    throw new Error('Allowed: PNG, JPEG, WebP, PDF, DOC/DOCX, PPT/PPTX, TXT');
  }
  if (size > MAX_PNG_PDF_BYTES) {
    throw new Error('File exceeds 20 MB limit');
  }
}

/** Multer often gives UTF-8 filenames decoded as latin1 (кириллица → ÐºÐ¸...). */
export function decodeUploadFilename(name: string): string {
  if (!name) return 'file';
  try {
    // Already proper Cyrillic — leave as-is
    if (/[А-Яа-яЁё]/.test(name) && !/[ÐÑÃ]/.test(name)) {
      return name;
    }
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    if (decoded && decoded !== name) {
      return decoded;
    }
  } catch {
    /* keep original */
  }
  return name;
}
