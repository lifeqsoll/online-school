import { useQuery } from '@tanstack/react-query';
import { Typography, message } from 'antd';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../../shared/api/client';

type CourseDetail = {
  modules: Array<{
    lessons: Array<{
      id: string;
      title: string;
      type: string;
      content?: string | null;
      videoUrl?: string | null;
    }>;
  }>;
};

type Playback = {
  kind: 'direct' | 'youtube' | 'vimeo' | string;
  url: string;
};

export function LkLessonPage() {
  const { lessonId = '' } = useParams();

  const courseHint = useQuery({
    queryKey: ['lesson-meta', lessonId],
    queryFn: async () => {
      // Find lesson via enrollments → courses (simple path: try playback + search enrollments)
      const enrollments = await api<Array<{ courseId: string }>>('/me/enrollments');
      for (const e of enrollments) {
        const c = await api<CourseDetail>(`/courses/${e.courseId}`);
        for (const m of c.modules) {
          const lesson = m.lessons.find((l) => l.id === lessonId);
          if (lesson) return lesson;
        }
      }
      return null;
    },
    enabled: !!lessonId,
  });

  const playback = useQuery({
    queryKey: ['playback', lessonId],
    queryFn: () => api<Playback>(`/lessons/${lessonId}/playback`),
    enabled: !!lessonId,
    retry: false,
  });

  useEffect(() => {
    if (playback.error instanceof ApiError && playback.error.status === 403) {
      message.error('Нет доступа к уроку');
    }
  }, [playback.error]);

  const lesson = courseHint.data;

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {lesson?.title || 'Урок'}
      </Typography.Title>

      {lesson?.content ? (
        <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
          {lesson.content}
        </Typography.Paragraph>
      ) : null}

      {playback.data ? (
        playback.data.kind === 'youtube' || playback.data.kind === 'vimeo' ? (
          <iframe
            title="video"
            src={playback.data.url}
            style={{ width: '100%', aspectRatio: '16/9', border: 0, borderRadius: 8 }}
            allowFullScreen
          />
        ) : (
          <video src={playback.data.url} controls style={{ width: '100%', borderRadius: 8 }} />
        )
      ) : playback.isError && !lesson?.content ? (
        <Typography.Text type="secondary">Видео недоступно или урок текстовый</Typography.Text>
      ) : null}
    </div>
  );
}
