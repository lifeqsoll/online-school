import { useQuery } from '@tanstack/react-query';
import { Button, Table, Typography, Empty } from 'antd';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../../shared/api/client';
import { fadeUp } from '../../shared/motion';

type Course = {
  id: string;
  title: string;
  isPublished: boolean;
};

const TAB_HINT: Record<string, string> = {
  hw: 'домашним заданиям',
  review: 'проверке работ',
  students: 'ученикам',
  analytics: 'аналитике',
  xp: 'XP и лидерборду',
  content: 'содержанию курса',
  curators: 'кураторам',
};

export function CourseHubPage({
  base,
  tab,
  title,
  managedOnly,
}: {
  base: '/admin' | '/curator';
  tab: string;
  title: string;
  managedOnly?: boolean;
}) {
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ['courses', managedOnly ? 'managed' : 'all'],
    queryFn: () =>
      api<Course[]>(
        managedOnly ? '/courses?managedOnly=true' : '/courses',
      ),
  });

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {title}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Выберите курс, чтобы открыть раздел «{TAB_HINT[tab] ?? tab}».
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={q.isLoading}
        dataSource={q.data ?? []}
        locale={{
          emptyText: (
            <Empty
              description={
                managedOnly
                  ? 'Нет курсов, где вы куратор. Попросите администратора назначить вас.'
                  : 'Курсов пока нет'
              }
            />
          ),
        }}
        columns={[
          { title: 'Курс', dataIndex: 'title' },
          {
            title: '',
            width: 160,
            render: (_, r) => (
              <Button
                type="primary"
                onClick={() => nav(`${base}/courses/${r.id}?tab=${tab}`)}
              >
                Открыть
              </Button>
            ),
          },
        ]}
      />
    </motion.div>
  );
}
