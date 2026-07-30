import { useQuery } from '@tanstack/react-query';
import { Empty, Progress, Select, Typography } from 'antd';
import { StarFilled } from '@ant-design/icons';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { useMemo, useState } from 'react';
import { api } from '../../shared/api/client';

type Enrollment = {
  courseId: string;
  course: { id: string; title: string };
};

type RadarPayload = {
  labels: string[];
  values: number[];
  struggling?: boolean[];
};

export function LkStatsPage() {
  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Enrollment[]>('/me/enrollments'),
  });

  const [courseId, setCourseId] = useState<string>();

  const options = useMemo(
    () =>
      (enrollments.data ?? []).map((e) => ({
        value: e.courseId,
        label: e.course?.title ?? e.courseId,
      })),
    [enrollments.data],
  );

  const activeId = courseId ?? options[0]?.value;

  const xp = useQuery({
    queryKey: ['xp-me', activeId],
    queryFn: () => api<{ totalXp: number }>(`/courses/${activeId}/xp/me`),
    enabled: !!activeId,
  });

  const radar = useQuery({
    queryKey: ['radar-me', activeId],
    queryFn: () =>
      api<RadarPayload>(`/courses/${activeId}/analytics/radar/me`),
    enabled: !!activeId,
    retry: false,
  });

  const leaderboard = useQuery({
    queryKey: ['leaderboard', activeId],
    queryFn: () =>
      api<Array<{ userId: string; totalXp: number; rank?: number; displayName?: string }>>(
        `/courses/${activeId}/leaderboard?limit=10`,
      ),
    enabled: !!activeId,
  });

  const radarData =
    radar.data?.labels.map((label, i) => ({
      topic: label,
      value: radar.data?.values[i] ?? 0,
      fullMark: 100,
    })) ?? [];

  const totalXp = xp.data?.totalXp ?? 0;
  const barMax = Math.max(100, Math.ceil((totalXp + 1) / 100) * 100);

  if (!enrollments.isLoading && !options.length) {
    return (
      <Empty description="Нет курсов — статистика появится после записи" />
    );
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Статистика
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Ваша успеваемость по курсу
      </Typography.Paragraph>

      <Select
        style={{ width: 360, marginBottom: 24 }}
        value={activeId}
        onChange={setCourseId}
        options={options}
        placeholder="Курс"
      />

      <div
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
        }}
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          <StarFilled style={{ color: '#faad14', marginRight: 8 }} />
          Опыт
        </Typography.Title>
        <Typography.Text style={{ fontSize: 28, fontWeight: 700 }}>
          {totalXp} XP
        </Typography.Text>
        <Progress
          percent={Math.min(100, Math.round((totalXp / barMax) * 100))}
          style={{ marginTop: 12 }}
          strokeColor="#beaaf2"
        />
        <Typography.Text type="secondary">
          До следующего порога: {Math.max(0, barMax - totalXp)} XP
        </Typography.Text>
      </div>

      <div
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 20,
          minHeight: 320,
        }}
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Темы (роза ветров)
        </Typography.Title>
        {radar.isLoading ? (
          <Typography.Text type="secondary">Загрузка…</Typography.Text>
        ) : radar.isError || !radarData.length ? (
          <Typography.Text type="secondary">
            Пока недостаточно данных по темам
          </Typography.Text>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="topic" tick={{ fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} />
              <Radar
                name="Мастерство"
                dataKey="value"
                stroke="#beaaf2"
                fill="#beaaf2"
                fillOpacity={0.45}
              />
            </RadarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div
        style={{
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
        }}
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Лидерборд курса
        </Typography.Title>
        {(leaderboard.data ?? []).length ? (
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {leaderboard.data!.map((row) => (
              <li key={row.userId} style={{ marginBottom: 6 }}>
                #{row.rank ?? 0} · {row.displayName ?? 'User'} · {row.totalXp} XP
              </li>
            ))}
          </ol>
        ) : (
          <Typography.Text type="secondary">Пока пусто</Typography.Text>
        )}
      </div>
    </div>
  );
}
