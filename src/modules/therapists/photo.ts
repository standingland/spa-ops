export const PHOTO_MAX_BYTES = 512 * 1024;
export const PHOTO_BUCKET = 'therapist-photos';

/** The server-side safety net; the browser always sends a resized JPEG far below this. */
export function checkPhoto(file: { type: string; size: number }): 'ok' | 'INVALID_INPUT' {
  const typeOk = file.type === 'image/jpeg' || file.type === 'image/png';
  return typeOk && file.size > 0 && file.size <= PHOTO_MAX_BYTES ? 'ok' : 'INVALID_INPUT';
}

/** A new name for every upload, so a replaced photo can never be served from a cached old URL. */
export function photoObjectName(therapistId: string, stamp: number): string {
  return `${therapistId}-${stamp}.jpg`;
}
