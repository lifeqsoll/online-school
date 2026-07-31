import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import { CustomerServiceOutlined, StarFilled } from '@ant-design/icons';
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
  course: {
    id: string;
    title: string;
    description?: string | null;
    coverUrl?: string | null;
  };
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

      <Link to="/lk/support/course" style={{ textDecoration: 'none', color: 'inherit' }}>
        <motion.div
          whileHover={{ y: -2, boxShadow: '0 10px 24px rgba(107, 79, 184, 0.12)' }}
          transition={{ duration: 0.22 }}
          style={{
            marginTop: 20,
            background:
              'linear-gradient(120deg, rgba(190,170,242,0.22), rgba(148,200,255,0.18))',
            border: '1px solid rgba(190,170,242,0.35)',
            borderRadius: 14,
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6b4fb8',
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            <CustomerServiceOutlined />
          </div>
          <div>
            <Typography.Text strong style={{ display: 'block' }}>
              Поддержка курса
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              Вопрос куратору по материалам, ДЗ или занятиям
            </Typography.Text>
          </div>
        </motion.div>
      </Link>

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
        {(Array.isArray(enrollments.data) ? enrollments.data : []).map((e, i) => {
          const hasCover = !!e.course.coverUrl;
          return (
          <motion.div key={e.courseId} variants={fadeUp} custom={i}>
            <Link
              to={`/lk/courses/${e.courseId}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <motion.div
                whileHover={{
                  y: -4,
                  boxShadow: '0 10px 24px rgba(107, 79, 184, 0.12)',
                }}
                transition={{ duration: 0.22 }}
                style={{
                  background: hasCover
                    ? `#1a1525 url(${e.course.coverUrl}) center/cover no-repeat`
                    : '#fff',
                  border: hasCover
                    ? '1px solid rgba(0,0,0,0.08)'
                    : '1px solid #ebebeb',
                  borderRadius: 14,
                  padding: 16,
                  minHeight: 120,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {hasCover ? (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background:
                        'linear-gradient(180deg, rgba(20,16,32,0.2) 0%, rgba(12,10,20,0.82) 100%)',
                      pointerEvents: 'none',
                    }}
                  />
                ) : null}
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                  >
                    <Typography.Text
                      strong
                      style={{
                        fontSize: 14,
                        color: hasCover ? '#fff' : undefined,
                      }}
                    >
                      {e.course.title}
                    </Typography.Text>
                    <Typography.Text
                      style={{
                        whiteSpace: 'nowrap',
                        color: hasCover ? 'rgba(255,255,255,0.75)' : undefined,
                      }}
                      type={hasCover ? undefined : 'secondary'}
                    >
                      <StarFilled style={{ color: '#faad14' }} /> XP
                    </Typography.Text>
                  </div>
                  <Typography.Paragraph
                    ellipsis={{ rows: 2 }}
                    style={{
                      marginTop: 10,
                      marginBottom: 0,
                      fontSize: 13,
                      color: hasCover
                        ? 'rgba(255,255,255,0.75)'
                        : 'rgba(0,0,0,0.45)',
                    }}
                  >
                    {e.course.description ||
                      'Открыть курс · уроки и домашние задания'}
                  </Typography.Paragraph>
                </div>
              </motion.div>
            </Link>
          </motion.div>
          );
        })}
        {!enrollments.data?.length ? (
          <Typography.Text type="secondary">
            Пока нет курсов — запишитесь через публичный каталог на сайте
          </Typography.Text>
        ) : null}
      </motion.div>
    </div>
  );
}
