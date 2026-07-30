import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import { StarFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import {
  WeekStripCalendar,
  type CalEvent,
} from '../../features/schedule/WeekStripCalendar';

dayjs.extend(isoWeek);

type Enrollment = {
  courseId: string;
  course: { id: string; title: string; description?: string | null };
};

export function LkHomePage() {
  const from = dayjs().startOf('day').toISOString();
  const to = dayjs().add(6, 'day').endOf('day').toISOString();

  const cal = useQuery({
    queryKey: ['me-calendar', from, to],
    queryFn: () =>
      api<CalEvent[]>(
        `/me/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });

  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Enrollment[]>('/me/enrollments'),
  });

  return (
    <div style={{ maxWidth: 1100 }}>
      <WeekStripCalendar events={cal.data ?? []} daysCount={7} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 28,
          marginBottom: 12,
        }}
      >
        <Typography.Title level={3} style={{ margin: 0 }}>
          Продолжить обучение
        </Typography.Title>
        <Link to="/catalog" style={{ color: '#8c8c8c' }}>
          Мои курсы ›
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}
      >
        {(enrollments.data ?? []).map((e) => (
          <Link
            key={e.courseId}
            to={`/lk/courses/${e.courseId}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div
              style={{
                background: '#fff',
                border: '1px solid #ebebeb',
                borderRadius: 14,
                padding: 16,
                minHeight: 110,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <Typography.Text strong style={{ fontSize: 14 }}>
                  {e.course.title}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                  <StarFilled style={{ color: '#faad14' }} /> XP
                </Typography.Text>
              </div>
              <Typography.Paragraph
                type="secondary"
                ellipsis={{ rows: 2 }}
                style={{ marginTop: 10, marginBottom: 0, fontSize: 13 }}
              >
                {e.course.description || 'Открыть курс · уроки и домашние задания'}
              </Typography.Paragraph>
            </div>
          </Link>
        ))}
        {!enrollments.data?.length ? (
          <Typography.Text type="secondary">
            Пока нет курсов — загляните в <Link to="/catalog">каталог</Link>
          </Typography.Text>
        ) : null}
      </div>
    </div>
  );
}
