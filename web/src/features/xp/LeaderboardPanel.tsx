import { useQuery } from '@tanstack/react-query';
import { Table, Tag, Typography } from 'antd';
import { api } from '../../shared/api/client';
import { getRankProgress } from '../../shared/xp/ranks';

export function LeaderboardPanel({ courseId }: { courseId: string }) {
  const q = useQuery({
    queryKey: ['leaderboard', courseId],
    queryFn: () =>
      api<
        Array<{
          rank: number;
          userId: string;
          displayName: string;
          totalXp: number;
        }>
      >(`/courses/${courseId}/leaderboard?limit=50`),
  });

  const me = useQuery({
    queryKey: ['xp-me', courseId],
    queryFn: () => api<{ totalXp: number }>(`/courses/${courseId}/xp/me`),
  });

  const myRank = getRankProgress(me.data?.totalXp ?? 0);

  return (
    <div>
      <Typography.Paragraph>
        Ваш XP на курсе: <strong>{me.data?.totalXp ?? 0}</strong>
        {' · '}
        ранг:{' '}
        <Tag color="purple" style={{ marginInlineEnd: 0 }}>
          {myRank.current.title}
        </Tag>
        {myRank.next ? (
          <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            следующий: {myRank.next.title} (ещё {myRank.xpToNext} XP)
          </Typography.Text>
        ) : null}
      </Typography.Paragraph>
      <Table
        rowKey="userId"
        loading={q.isLoading}
        dataSource={q.data ?? []}
        columns={[
          { title: '#', dataIndex: 'rank', width: 60 },
          { title: 'Ученик', dataIndex: 'displayName' },
          {
            title: 'Ранг',
            key: 'xpRank',
            width: 160,
            render: (_, row) => {
              const r = getRankProgress(row.totalXp).current;
              return <Tag color="purple">{r.title}</Tag>;
            },
          },
          { title: 'XP', dataIndex: 'totalXp', width: 100 },
        ]}
      />
    </div>
  );
}
