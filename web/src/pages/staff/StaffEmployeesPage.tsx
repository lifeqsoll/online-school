import { useQuery } from '@tanstack/react-query';
import { Drawer, Rate, Table, Tag, Typography } from 'antd';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { api } from '../../shared/api/client';
import { fadeUp } from '../../shared/motion';
import dayjs from 'dayjs';

type StaffRow = {
  userId: string;
  email?: string | null;
  firstName?: string | null;
  nickname?: string | null;
  globalRole: string;
  roleLabel: string;
  avgScore: number;
  ratingCount: number;
};

type RatingRow = {
  id: string;
  score: number;
  comment: string | null;
  createdAt: string;
  raterName: string | null;
  thread: {
    id: string;
    subject: string;
    channel: string;
  };
};

export function StaffEmployeesPage() {
  const [agentId, setAgentId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['admin-staff-ratings'],
    queryFn: () => api<StaffRow[]>('/admin/staff/ratings'),
  });

  const detail = useQuery({
    queryKey: ['admin-staff-ratings', agentId],
    queryFn: () => api<RatingRow[]>(`/admin/staff/${agentId}/ratings`),
    enabled: !!agentId,
  });

  const selected = list.data?.find((r) => r.userId === agentId);

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Сотрудники
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Средние оценки по закрытым обращениям (кураторы, поддержка, админы)
      </Typography.Paragraph>
      <Table
        rowKey="userId"
        loading={list.isLoading}
        dataSource={list.data ?? []}
        columns={[
          {
            title: 'Сотрудник',
            render: (_, r) =>
              r.nickname || r.firstName || r.email || r.userId,
          },
          { title: 'Email', dataIndex: 'email' },
          {
            title: 'Роль',
            dataIndex: 'roleLabel',
            render: (v: string) => <Tag color="purple">{v}</Tag>,
          },
          {
            title: 'Средняя',
            dataIndex: 'avgScore',
            render: (v: number, r) =>
              r.ratingCount ? (
                <span
                  style={{ cursor: 'pointer', color: '#6b4fb8' }}
                  onClick={() => setAgentId(r.userId)}
                >
                  <Rate disabled allowHalf value={v} style={{ fontSize: 14 }} />{' '}
                  {v}
                </span>
              ) : (
                '—'
              ),
          },
          { title: 'Оценок', dataIndex: 'ratingCount' },
        ]}
      />

      <Drawer
        open={!!agentId}
        onClose={() => setAgentId(null)}
        width={480}
        title={
          selected
            ? `Оценки: ${selected.nickname || selected.firstName || selected.email}`
            : 'Оценки'
        }
      >
        <Table
          rowKey="id"
          loading={detail.isLoading}
          dataSource={detail.data ?? []}
          pagination={false}
          columns={[
            {
              title: 'Оценка',
              dataIndex: 'score',
              render: (v: number) => <Rate disabled value={v} style={{ fontSize: 12 }} />,
            },
            { title: 'Комментарий', dataIndex: 'comment' },
            {
              title: 'Обращение',
              render: (_, r) => r.thread.subject,
            },
            {
              title: 'Дата',
              dataIndex: 'createdAt',
              render: (v: string) => dayjs(v).format('DD.MM.YYYY'),
            },
          ]}
        />
      </Drawer>
    </motion.div>
  );
}
