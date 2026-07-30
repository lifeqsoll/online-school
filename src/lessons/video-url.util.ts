export type PlaybackKind = 'direct' | 'youtube' | 'vimeo';

export function classifyExternalVideoUrl(raw: string): {
  kind: PlaybackKind;
  url: string;
} {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'https:') {
    throw new Error('Only https video URLs are allowed');
  }

  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') {
    return { kind: 'youtube', url: raw };
  }
  if (host === 'vimeo.com' || host.endsWith('.vimeo.com')) {
    return { kind: 'vimeo', url: raw };
  }
  if (url.pathname.toLowerCase().endsWith('.mp4') || host.includes('cdn')) {
    return { kind: 'direct', url: raw };
  }
  // Allow other https URLs as direct play candidates (browser may still fail)
  return { kind: 'direct', url: raw };
}
