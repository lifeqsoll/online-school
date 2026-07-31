import type { CSSProperties, ReactNode } from 'react';
import {
  AppstoreOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';

export type LessonKind = 'LIVE' | 'VIDEO' | 'TEXT' | 'MIXED';

/**
 * LIVE — only when there is a meeting link.
 * Otherwise: VIDEO / TEXT / MIXED from type + actual video presence
 * (corrects TEXT lessons that already have an uploaded/external video).
 */
export function resolveLessonKind(lesson: {
  type?: string | null;
  meetingUrl?: string | null;
  hasVideo?: boolean | null;
  videoUrl?: string | null;
  videoSource?: string | null;
  content?: string | null;
}): LessonKind {
  if (lesson.meetingUrl?.trim()) return 'LIVE';

  const hasVideo =
    !!lesson.hasVideo ||
    !!lesson.videoSource ||
    !!(lesson.videoUrl && String(lesson.videoUrl).trim());
  const hasText = !!(lesson.content && String(lesson.content).trim());
  const t = (lesson.type || '').toUpperCase();

  if (t === 'MIXED' || (hasVideo && hasText)) return 'MIXED';
  if (t === 'VIDEO' || hasVideo) return 'VIDEO';
  if (t === 'TEXT') return 'TEXT';
  return hasVideo ? 'VIDEO' : 'TEXT';
}

export function lessonKindLabel(kind: LessonKind): string {
  switch (kind) {
    case 'LIVE':
      return 'LIVE';
    case 'VIDEO':
      return 'Видео';
    case 'TEXT':
      return 'Текст';
    case 'MIXED':
      return 'Смешанный';
  }
}

export function lessonKindAccent(kind: LessonKind): {
  bg: string;
  color: string;
} {
  switch (kind) {
    case 'LIVE':
      return { bg: 'rgba(148,200,255,0.25)', color: '#3b6ea5' };
    case 'VIDEO':
      return { bg: 'rgba(190,170,242,0.28)', color: '#6b4fb8' };
    case 'TEXT':
      return { bg: 'rgba(0,0,0,0.06)', color: '#595959' };
    case 'MIXED':
      return { bg: 'rgba(250,173,20,0.18)', color: '#d48806' };
  }
}

export function LessonTypeIcon({
  lesson,
  style,
}: {
  lesson: {
    type?: string | null;
    meetingUrl?: string | null;
    hasVideo?: boolean | null;
    videoUrl?: string | null;
    videoSource?: string | null;
    content?: string | null;
  };
  style?: CSSProperties;
}): ReactNode {
  const kind = resolveLessonKind(lesson);
  const accent = lessonKindAccent(kind);
  const base: CSSProperties = {
    marginTop: 3,
    color: accent.color,
    ...style,
  };
  if (kind === 'LIVE') {
    return <VideoCameraOutlined style={base} />;
  }
  if (kind === 'MIXED') {
    return <AppstoreOutlined style={base} />;
  }
  if (kind === 'TEXT') {
    return <FileTextOutlined style={base} />;
  }
  return <PlayCircleOutlined style={base} />;
}
