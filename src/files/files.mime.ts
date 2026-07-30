export const PNG_PDF_MIMES = new Set(['image/png', 'application/pdf']);
export const MAX_PNG_PDF_BYTES = 20 * 1024 * 1024;

export function assertPngOrPdf(mime: string, size: number): void {
  if (!PNG_PDF_MIMES.has(mime)) {
    throw new Error('Only PNG and PDF are allowed');
  }
  if (size > MAX_PNG_PDF_BYTES) {
    throw new Error('File exceeds 20 MB limit');
  }
}
