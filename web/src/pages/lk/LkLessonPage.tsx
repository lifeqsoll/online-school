import { useMutation, useQuery } from '@tanstack/react-query';
import { Spin, Typography } from 'antd';
import { CheckCircleFilled, LockOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../shared/api/client';
import { FileList } from '../../shared/files/FileList';
import {
  LessonTypeIcon,
  lessonKindLabel,
  resolveLessonKind,
} from '../../shared/lessons/lessonTypeIcon';

type LessonView = {
  id: string;
  title: string;
  type: string;
  content?: string | null;
  meetingUrl?: string | null;
  videoUrl?: string | null;
  videoSource?: string | null;
  hasVideo?: boolean;
  scheduledAt?: string | null;
  contentOpen: boolean;
  unlocksAt?: string | null;
  contentUnlockDaysBefore?: number;
};

type Playback = {
  kind: 'direct' | 'youtube' | 'vimeo' | string;
  url: string;
};

const DWELL_MS = 2 * 60 * 1000;
const VIDEO_COMPLETE_PCT = 80;

export function LkLessonPage() {
  const { lessonId = '' } = useParams();
  const [completed, setCompleted] = useState(false);
  const dwellAccRef = useRef(0);
  const dwellTickRef = useRef<number | null>(null);
  const lastVisibleRef = useRef<number | null>(null);
  const completedRef = useRef(false);
  const maxPctSentRef = useRef(0);

  const lessonQ = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => api<LessonView>(`/lessons/${lessonId}`),
    enabled: !!lessonId,
  });

  const open = lessonQ.data?.contentOpen === true;

  const playback = useQuery({
    queryKey: ['playback', lessonId],
    queryFn: () => api<Playback>(`/lessons/${lessonId}/playback`),
    enabled: !!lessonId && open,
    retry: false,
  });

  const engage = useMutation({
    mutationFn: (body: { type: 'VIEW' | 'COMPLETE'; progressPct?: number }) =>
      api(`/lessons/${lessonId}/engagement`, { method: 'POST', json: body }),
    onSuccess: (row: { completedAt?: string | null }) => {
      if (row?.completedAt) {
        completedRef.current = true;
        setCompleted(true);
      }
    },
  });

  const markComplete = (progressPct?: number) => {
    if (completedRef.current || !lessonId) return;
    completedRef.current = true;
    setCompleted(true);
    engage.mutate({
      type: 'COMPLETE',
      progressPct: progressPct ?? VIDEO_COMPLETE_PCT,
    });
  };

  const lesson = lessonQ.data;
  const kind = lesson ? resolveLessonKind(lesson) : 'TEXT';
  const isVideoLike = kind === 'VIDEO' || kind === 'MIXED';
  const useVideoProgress =
    isVideoLike && playback.data?.kind === 'direct';
  const useDwell =
    kind === 'LIVE' ||
    kind === 'TEXT' ||
    (isVideoLike && !useVideoProgress);

  // VIEW on open
  useEffect(() => {
    if (!lessonId || !open) return;
    engage.mutate({ type: 'VIEW', progressPct: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, open]);

  // 2-minute dwell for TEXT / LIVE / embed video
  useEffect(() => {
    if (!open || !useDwell || completedRef.current) return;

    const flush = () => {
      if (lastVisibleRef.current == null) return;
      dwellAccRef.current += Date.now() - lastVisibleRef.current;
      lastVisibleRef.current = document.hidden ? null : Date.now();
      if (dwellAccRef.current >= DWELL_MS) {
        markComplete(VIDEO_COMPLETE_PCT);
      }
    };

    const onVis = () => {
      if (document.hidden) {
        flush();
      } else {
        lastVisibleRef.current = Date.now();
      }
    };

    if (!document.hidden) lastVisibleRef.current = Date.now();
    document.addEventListener('visibilitychange', onVis);
    dwellTickRef.current = window.setInterval(flush, 5000);

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (dwellTickRef.current) window.clearInterval(dwellTickRef.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, useDwell, lessonId]);

  const onVideoTime = (el: HTMLVideoElement) => {
    if (!el.duration || !Number.isFinite(el.duration)) return;
    const pct = Math.min(100, Math.round((el.currentTime / el.duration) * 100));
    if (pct >= maxPctSentRef.current + 10 || pct >= VIDEO_COMPLETE_PCT) {
      maxPctSentRef.current = pct;
      if (pct >= VIDEO_COMPLETE_PCT) {
        markComplete(pct);
      } else {
        engage.mutate({ type: 'VIEW', progressPct: pct });
      }
    }
  };

  if (lessonQ.isLoading) return <Spin style={{ margin: 48 }} />;
  if (lessonQ.isError) {
    return (
      <Typography.Text type="danger">
        {lessonQ.error instanceof ApiError
          ? lessonQ.error.message
          : 'Не удалось открыть урок'}
      </Typography.Text>
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <Typography.Title
        level={3}
        style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: 10 }}
      >
        {lesson ? <LessonTypeIcon lesson={lesson} style={{ marginTop: 0, fontSize: 22 }} /> : null}
        {lesson?.title || 'Урок'}
      </Typography.Title>

      <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
        {lessonKindLabel(kind)}
        {lesson?.scheduledAt
          ? ` · ${dayjs(lesson.scheduledAt).format('D MMMM YYYY, HH:mm')}`
          : ''}
        {completed ? (
          <span style={{ marginLeft: 10, color: '#52c41a' }}>
            <CheckCircleFilled /> Засчитан
          </span>
        ) : null}
      </Typography.Paragraph>

      {!open ? (
        <div
          style={{
            marginTop: 8,
            padding: '20px 18px',
            borderRadius: 14,
            border: '1px solid #ffd591',
            background: '#fff7e6',
          }}
        >
          <Typography.Text strong style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LockOutlined /> Материалы пока закрыты
          </Typography.Text>
          <Typography.Paragraph style={{ marginTop: 10, marginBottom: 0 }}>
            Видео, файлы и ссылка на встречу откроются
            {lesson?.unlocksAt
              ? ` ${dayjs(lesson.unlocksAt).format('D MMMM YYYY, HH:mm')}`
              : ' по расписанию'}
            {lesson?.contentUnlockDaysBefore != null
              ? ` (за ${lesson.contentUnlockDaysBefore} дн. до урока)`
              : ''}
            . В календаре занятие уже видно.
          </Typography.Paragraph>
        </div>
      ) : (
        <>
          {lesson?.content ? (
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
              {lesson.content}
            </Typography.Paragraph>
          ) : null}

          {lesson?.meetingUrl ? (
            <Typography.Paragraph>
              <a href={lesson.meetingUrl} target="_blank" rel="noreferrer">
                Ссылка на встречу
              </a>
            </Typography.Paragraph>
          ) : null}

          {playback.data ? (
            playback.data.kind === 'youtube' || playback.data.kind === 'vimeo' ? (
              <iframe
                title="video"
                src={playback.data.url}
                style={{
                  width: '100%',
                  aspectRatio: '16/9',
                  border: 0,
                  borderRadius: 8,
                }}
                allowFullScreen
              />
            ) : (
              <video
                src={playback.data.url}
                controls
                style={{ width: '100%', borderRadius: 8 }}
                onTimeUpdate={(e) => onVideoTime(e.currentTarget)}
                onEnded={(e) => onVideoTime(e.currentTarget)}
              />
            )
          ) : playback.isError && !lesson?.content ? (
            <Typography.Text type="secondary">
              Видео недоступно или урок текстовый
            </Typography.Text>
          ) : null}

          {useDwell && !completed ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, fontSize: 13 }}>
              Урок засчитается после ~2 минут на этой странице
              {isVideoLike && playback.data && playback.data.kind !== 'direct'
                ? ' (внешнее видео)'
                : ''}
              .
            </Typography.Paragraph>
          ) : null}
          {useVideoProgress && !completed ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, fontSize: 13 }}>
              Урок засчитается после просмотра ≥80% видео.
            </Typography.Paragraph>
          ) : null}

          {lessonId ? (
            <div style={{ marginTop: 24 }}>
              <Typography.Title level={5}>Материалы</Typography.Title>
              <FileList
                ownerType="LESSON_MATERIAL"
                ownerId={lessonId}
                canDelete={false}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
