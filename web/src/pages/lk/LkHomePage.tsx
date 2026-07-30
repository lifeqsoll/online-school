import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import { StarFilled } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../../shared/api/client';
import {
  WeekStripCalendar,
  type CalEvent,
} from '../../features/schedule/WeekStripCalendar';
import { fadeUp, stagger } from '../../shared/motion';

type Enrollment = {
  courseId: string;
  course: { id: string; title: string; description?: string | null };
};

export function LkHomePage() {
  const from = dayjs().startOf('day').toISOString();
  const to = dayjs().add(6, 'day').endOf('day').toISOString();

  const cal = useQuery({
    queryKey: ['me-calendar', 'home-week', from, to],
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
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <WeekStripCalendar events={Array.isArray(cal.data) ? cal.data : []} />
      </motion.div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 24,
          marginBottom: 12,
        }}
      >
        <Typography.Title level={3} style={{ margin: 0 }}>
          Продолжить обучение
        </Typography.Title>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}
      >
        {(Array.isArray(enrollments.data) ? enrollments.data : []).map((e, i) => (
          <motion.div key={e.courseId} variants={fadeUp} custom={i}>
            <Link
              to={`/lk/courses/${e.courseId}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <motion.div
                whileHover={{ y: -4, boxShadow: '0 10px 24px rgba(107, 79, 184, 0.12)' }}
                transition={{ duration: 0.22 }}
                style={{
                  background: '#fff',
                  border: '1px solid #ebebeb',
                  borderRadius: 14,
                  padding: 16,
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
              </motion.div>
            </Link>
          </motion.div>
        ))}
        {!enrollments.data?.length ? (
          <Typography.Text type="secondary">
            Пока нет курсов — запишитесь через публичный каталог на сайте
          </Typography.Text>
        ) : null}
      </motion.div>
    </div>
  );
}
