import { useQuery } from '@tanstack/react-query';
import { Table, Typography } from 'antd';
import { api } from '../../shared/api/client';

export function LeaderboardPanel({ courseId }: { courseId: string }) {
  const q = useQuery({
    queryKey: ['leaderboard', courseId],
    queryFn: () =>
      api<Array<{ rank: number; userId: string; displayName: string; totalXp: number }>>(
        `/courses/${courseId}/leaderboard?limit=50`,
      ),
  });

  const me = useQuery({
    queryKey: ['xp-me', courseId],
    queryFn: () => api<{ totalXp: number }>(`/courses/${courseId}/xp/me`),
  });

  return (
    <div>
      <Typography.Paragraph>
        Ваш XP на курсе: <strong>{me.data?.totalXp ?? 0}</strong>
      </Typography.Paragraph>
      <Table
        rowKey="userId"
        loading={q.isLoading}
        dataSource={q.data ?? []}
        columns={[
          { title: '#', dataIndex: 'rank', width: 60 },
          { title: 'Ученик', dataIndex: 'displayName' },
          { title: 'XP', dataIndex: 'totalXp' },
        ]}
      />
    </div>
  );
}
