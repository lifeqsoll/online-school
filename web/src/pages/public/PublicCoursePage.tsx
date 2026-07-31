import { useQuery } from '@tanstack/react-query';
import { Spin, Typography } from 'antd';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, getAccessToken } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthContext';
import { EnrollBuyButton } from '../../features/catalog/EnrollBuyButton';
import { easeOutExpo, fadeUp, stagger } from '../../shared/motion';
import { courseColor } from '../../shared/schedule/courseColor';

type CourseDetail = {
  id: string;
  title: string;
  description?: string | null;
  priceCents: number;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{ id: string; title: string }>;
  }>;
};

type Enrollment = { courseId: string };

export function PublicCoursePage() {
  const { idOrSlug = '' } = useParams();
  const { user } = useAuth();

  const course = useQuery({
    queryKey: ['public-course', idOrSlug],
    queryFn: () =>
      api<CourseDetail>(`/courses/${idOrSlug}`, {
        auth: !!getAccessToken(),
      }),
    enabled: !!idOrSlug,
  });

  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Enrollment[]>('/me/enrollments'),
    enabled: !!user,
  });

  if (course.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!course.data) {
    return (
      <Typography.Text type="danger" style={{ display: 'block', padding: 48 }}>
        Курс не найден
      </Typography.Text>
    );
  }

  const c = course.data;
  const enrolled = !!enrollments.data?.some((e) => e.courseId === c.id);
  const colors = courseColor(c.id);
  const free = c.priceCents === 0;

  return (
    <div
      style={{
        background:
          'radial-gradient(ellipse 70% 40% at 30% 0%, rgba(190,170,242,0.2), transparent 55%), #f7f6fb',
        minHeight: 'calc(100vh - 140px)',
        paddingBottom: 48,
      }}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        style={{ maxWidth: 840, margin: '0 auto', padding: '36px 24px' }}
      >
        <motion.div
          variants={fadeUp}
          custom={0}
          style={{
            background: '#fff',
            borderRadius: 20,
            border: '1px solid rgba(190,170,242,0.3)',
            overflow: 'hidden',
            marginBottom: 24,
          }}
        >
          <div
            style={{
              height: 10,
              background: `linear-gradient(90deg, ${colors.border}, ${colors.bg})`,
            }}
          />
          <div style={{ padding: '28px 28px 24px' }}>
            <span
              style={{
                display: 'inline-block',
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 999,
                background: free ? 'rgba(82,196,26,0.12)' : 'rgba(190,170,242,0.2)',
                color: free ? '#389e0d' : '#6b4fb8',
                marginBottom: 14,
              }}
            >
              {free ? 'Бесплатно' : `${(c.priceCents / 100).toFixed(0)} ₽`}
            </span>
            <Typography.Title
              level={2}
              style={{ marginTop: 0, marginBottom: 10, letterSpacing: '-0.02em' }}
            >
              {c.title}
            </Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 16, maxWidth: 560 }}>
              {c.description || 'Описание скоро появится'}
            </Typography.Paragraph>
            <div style={{ marginTop: 8 }}>
              <EnrollBuyButton
                courseId={c.id}
                priceCents={c.priceCents}
                enrolled={enrolled}
              />
            </div>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} custom={1}>
          <Typography.Title level={4} style={{ marginBottom: 14 }}>
            Программа
          </Typography.Title>
          {!c.modules.length ? (
            <Typography.Text type="secondary">Модули пока не добавлены</Typography.Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {c.modules.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.06, duration: 0.4, ease: easeOutExpo }}
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    border: '1px solid rgba(190,170,242,0.25)',
                    padding: '16px 18px',
                  }}
                >
                  <Typography.Text strong style={{ fontSize: 15 }}>
                    {m.title}
                  </Typography.Text>
                  <div style={{ marginTop: 6 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {m.lessons.length
                        ? m.lessons.map((l) => l.title).join(' · ')
                        : 'Уроки появятся позже'}
                    </Typography.Text>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
