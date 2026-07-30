import { useQuery } from '@tanstack/react-query';
import { List, Typography } from 'antd';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { CalendarView, type CalEvent } from '../../features/schedule/CalendarView';

dayjs.extend(isoWeek);

type Enrollment = {
  courseId: string;
  course: { id: string; title: string };
};

export function LkHomePage() {
  const from = dayjs().startOf('isoWeek').toISOString();
  const to = dayjs().endOf('isoWeek').toISOString();

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
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Расписание на неделю
      </Typography.Title>
      <CalendarView events={cal.data ?? []} mode="week" />

      <Typography.Title level={4} style={{ marginTop: 28 }}>
        Мои курсы
      </Typography.Title>
      <List
        dataSource={enrollments.data ?? []}
        locale={{ emptyText: 'Пока нет курсов — загляните в каталог' }}
        renderItem={(e) => (
          <List.Item>
            <Link to={`/lk/courses/${e.courseId}`}>{e.course.title}</Link>
          </List.Item>
        )}
      />
    </div>
  );
}
