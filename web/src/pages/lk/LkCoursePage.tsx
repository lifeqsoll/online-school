import { useQuery } from '@tanstack/react-query';
import { Switch, Typography } from 'antd';
import { ArrowLeftOutlined, StarFilled, ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../shared/api/client';
import { assignmentTypeLabel } from '../../shared/assignments/labels';
import {
  WeekStripCalendar,
  type CalEvent,
} from '../../features/schedule/WeekStripCalendar';
import { easeOutExpo, tabPanelVariants } from '../../shared/motion';

type CourseDetail = {
  id: string;
  title: string;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{ id: string; title: string }>;
  }>;
};

type Assignment = {
  id: string;
  title: string;
  maxXp: number;
  dueAt?: string | null;
  description?: string | null;
  responseMode?: string | null;
  questions?: Array<{ type: string }>;
};

export function LkCoursePage() {
  const { courseId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') || 'lessons';
  const nav = useNavigate();
  const [hideSchedule, setHideSchedule] = useState(false);

  const from = dayjs().startOf('day').toISOString();
  const to = dayjs().add(6, 'day').endOf('day').toISOString();

  const course = useQuery({
    queryKey: ['lk-course', courseId],
    queryFn: () => api<CourseDetail>(`/courses/${courseId}`),
    enabled: !!courseId,
  });

  const assignments = useQuery({
    queryKey: ['assignments', courseId],
    queryFn: () => api<Assignment[]>(`/courses/${courseId}/assignments`),
    enabled: !!courseId,
  });

  const cal = useQuery({
    queryKey: ['course-events-student', courseId, from, to],
    queryFn: () =>
      api<CalEvent[]>(
        `/courses/${courseId}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
    enabled: !!courseId,
  });

  const lessons = useMemo(
    () =>
      (course.data?.modules ?? []).flatMap((m) =>
        m.lessons.map((l) => ({ ...l, moduleTitle: m.title })),
      ),
    [course.data],
  );

  if (!course.data) return <Typography.Text>Загрузка…</Typography.Text>;

  const tabs = [
    { key: 'lessons', label: 'Уроки' },
    { key: 'hw', label: 'Домашки' },
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button type="button" onClick={() => nav('/lk')} style={backBtn}>
          <ArrowLeftOutlined /> Назад
        </button>
        <Typography.Title level={3} style={{ margin: 0, flex: 1 }}>
          {course.data.title}
        </Typography.Title>
        <span style={{ fontSize: 13, color: '#8c8c8c' }}>Скрыть расписание</span>
        <Switch checked={hideSchedule} onChange={setHideSchedule} />
      </div>

      {!hideSchedule ? <WeekStripCalendar events={cal.data ?? []} /> : null}

      <div
        style={{
          display: 'flex',
          gap: 20,
          marginTop: 20,
          marginBottom: 14,
          borderBottom: '1px solid #ebebeb',
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSearch({ tab: t.key })}
            style={{
              border: 'none',
              background: 'none',
              padding: '8px 0 10px',
              cursor: 'pointer',
              fontWeight: 600,
              color: tab === t.key ? '#6b4fb8' : '#8c8c8c',
              position: 'relative',
            }}
          >
            {t.label}
            {tab === t.key ? (
              <motion.span
                layoutId="course-tab-underline"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 2,
                  background: '#6b4fb8',
                  borderRadius: 2,
                }}
                transition={{ duration: 0.28, ease: easeOutExpo }}
              />
            ) : null}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          variants={tabPanelVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.28, ease: easeOutExpo }}
        >
          {tab === 'lessons' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lessons.map((l, i) => (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.28, ease: easeOutExpo }}
                >
                  <Link
                    to={`/lk/lessons/${l.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <motion.div whileHover={{ y: -2 }} style={cardStyle}>
                      <ClockCircleOutlined style={{ color: '#69b1ff', marginTop: 4 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: '#69b1ff' }}>
                          Урок · {l.moduleTitle}
                        </div>
                        <div style={{ fontWeight: 600 }}>{l.title}</div>
                      </div>
                    </motion.div>
                  </Link>
                </motion.div>
              ))}
              {!lessons.length ? (
                <Typography.Text type="secondary">Уроков пока нет</Typography.Text>
              ) : null}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(assignments.data ?? []).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.28, ease: easeOutExpo }}
                >
                  <Link
                    to={`/lk/assignments/${a.id}`}
                    style={{ textDecoration: 'none', color: 'inherit' }}
                  >
                    <motion.div whileHover={{ y: -2 }} style={cardStyle}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, color: '#69b1ff' }}>
                          {assignmentTypeLabel(a.responseMode, a.questions)}
                          {a.dueAt
                            ? ` · дедлайн ${dayjs(a.dueAt).format('D MMM / HH:mm')}`
                            : ''}
                        </div>
                        <div style={{ fontWeight: 600 }}>{a.title}</div>
                      </div>
                      <Typography.Text>
                        <StarFilled style={{ color: '#faad14' }} /> +{a.maxXp}
                      </Typography.Text>
                    </motion.div>
                  </Link>
                </motion.div>
              ))}
              {!assignments.data?.length ? (
                <Typography.Text type="secondary">Нет опубликованных ДЗ</Typography.Text>
              ) : null}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

const cardStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  background: '#fff',
  border: '1px solid #ebebeb',
  borderRadius: 14,
  padding: '14px 16px',
};

const backBtn: CSSProperties = {
  border: '1px solid #ebebeb',
  background: '#fff',
  borderRadius: 10,
  padding: '6px 12px',
  cursor: 'pointer',
};
