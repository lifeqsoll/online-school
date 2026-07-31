import { useQuery } from '@tanstack/react-query';
import { Empty, Progress, Select, Typography } from 'antd';
import { StarFilled } from '@ant-design/icons';
import { useMemo, useState } from 'react';
import { api } from '../../shared/api/client';
import { WindRoseChart } from '../../shared/analytics/WindRoseChart';

type Enrollment = {
  courseId: string;
  course: { id: string; title: string };
};

type RadarPayload = {
  labels: string[];
  values: number[];
  scaleValues?: number[];
  scaleMax?: number;
  details?: Array<{
    lessonsDone: number;
    lessonsTotal: number;
    hwDone: number;
    hwTotal: number;
  }>;
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
      api<
        Array<{
          userId: string;
          totalXp: number;
          rank?: number;
          displayName?: string;
        }>
      >(`/courses/${activeId}/leaderboard?limit=10`),
    enabled: !!activeId,
  });

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
        Успеваемость по модулям курса: уроки и ДЗ (≥75%)
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
        }}
      >
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Роза ветров по модулям
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          Ось — модуль. Значение растёт, когда вы проходите уроки и сдаёте ДЗ
          на ≥75%.
        </Typography.Paragraph>
        <WindRoseChart
          data={radar.data}
          loading={radar.isLoading}
          emptyText="Добавьте модули в курс — роза появится здесь"
        />
        {radar.data?.details?.length ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 10,
              marginTop: 16,
            }}
          >
            {radar.data.labels.map((label, i) => {
              const d = radar.data!.details![i];
              return (
                <div
                  key={`${label}-${i}`}
                  style={{
                    background: '#fafafa',
                    borderRadius: 10,
                    padding: '10px 12px',
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <Typography.Text strong style={{ fontSize: 13 }}>
                    {label}
                  </Typography.Text>
                  <div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      Уроки {d.lessonsDone}/{d.lessonsTotal} · ДЗ {d.hwDone}/
                      {d.hwTotal}
                    </Typography.Text>
                  </div>
                  <Typography.Text style={{ fontSize: 12, color: '#6b4fb8' }}>
                    {radar.data!.values[i]}%
                  </Typography.Text>
                </div>
              );
            })}
          </div>
        ) : null}
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
                #{row.rank ?? 0} · {row.displayName ?? 'User'} · {row.totalXp}{' '}
                XP
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
