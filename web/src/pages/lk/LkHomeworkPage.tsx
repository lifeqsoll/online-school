import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import { StarFilled, ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';

type Enrollment = { courseId: string; course: { id: string; title: string } };
type Assignment = {
  id: string;
  title: string;
  maxXp: number;
  dueAt?: string | null;
};

export function LkHomeworkPage() {
  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Enrollment[]>('/me/enrollments'),
  });

  const homework = useQuery({
    queryKey: ['all-hw', enrollments.data?.map((e) => e.courseId).join(',')],
    queryFn: async () => {
      const rows: Array<Assignment & { courseTitle: string; courseId: string }> =
        [];
      for (const e of enrollments.data ?? []) {
        const list = await api<Assignment[]>(
          `/courses/${e.courseId}/assignments`,
        );
        for (const a of list) {
          rows.push({ ...a, courseTitle: e.course.title, courseId: e.courseId });
        }
      }
      return rows;
    },
    enabled: !!enrollments.data?.length,
  });

  return (
    <div style={{ maxWidth: 900 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Домашние задания
      </Typography.Title>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(homework.data ?? []).map((a) => (
          <Link
            key={a.id}
            to={`/lk/assignments/${a.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div
              style={{
                display: 'flex',
                gap: 12,
                background: '#fff',
                border: '1px solid #ebebeb',
                borderRadius: 14,
                padding: '14px 16px',
              }}
            >
              <ClockCircleOutlined style={{ color: '#69b1ff', marginTop: 4 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#69b1ff' }}>
                  {a.courseTitle}
                  {a.dueAt
                    ? ` · дедлайн ${dayjs(a.dueAt).format('D MMM / HH:mm')}`
                    : ''}
                </div>
                <div style={{ fontWeight: 600 }}>{a.title}</div>
              </div>
              <span>
                <StarFilled style={{ color: '#faad14' }} /> +{a.maxXp}
              </span>
            </div>
          </Link>
        ))}
        {!homework.data?.length && !homework.isLoading ? (
          <Typography.Text type="secondary">Пока нет заданий</Typography.Text>
        ) : null}
      </div>
    </div>
  );
}
