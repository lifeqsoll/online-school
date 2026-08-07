import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import {
  CustomerServiceOutlined,
  StarFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCallback, useMemo, useState } from 'react';
import { api } from '../../shared/api/client';
import {
  WeekStripCalendar,
  type CalEvent,
} from '../../features/schedule/WeekStripCalendar';
import { fadeUp, stagger } from '../../shared/motion';
import {
  LessonTypeIcon,
  lessonKindAccent,
  lessonKindLabel,
  resolveLessonKind,
} from '../../shared/lessons/lessonTypeIcon';

dayjs.extend(isoWeek);

type Enrollment = {
  courseId: string;
  course: {
    id: string;
    title: string;
    description?: string | null;
    coverUrl?: string | null;
  };
};

function defaultWeekRange() {
  const start = dayjs().startOf('isoWeek');
  return {
    from: start.startOf('day').toISOString(),
    to: start.add(6, 'day').endOf('day').toISOString(),
  };
}

export function LkHomePage() {
  const [weekRange, setWeekRange] = useState(defaultWeekRange);
  const onWeekRangeChange = useCallback(
    (range: { from: string; to: string }) => {
      setWeekRange((prev) =>
        prev.from === range.from && prev.to === range.to ? prev : range,
      );
    },
    [],
  );

  const upcomingFrom = dayjs().startOf('day').toISOString();
  const upcomingToIso = dayjs().add(7, 'day').endOf('day').toISOString();
  const upcomingTo = dayjs(upcomingToIso);

  const cal = useQuery({
    queryKey: ['me-calendar', 'home-week', weekRange.from, weekRange.to],
    queryFn: () =>
      api<CalEvent[]>(
        `/me/calendar?from=${encodeURIComponent(weekRange.from)}&to=${encodeURIComponent(weekRange.to)}`,
      ),
  });

  const upcomingCal = useQuery({
    queryKey: ['me-calendar', 'home-upcoming', upcomingFrom, upcomingToIso],
    queryFn: () =>
      api<CalEvent[]>(
        `/me/calendar?from=${encodeURIComponent(upcomingFrom)}&to=${encodeURIComponent(upcomingToIso)}`,
      ),
  });

  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Enrollment[]>('/me/enrollments'),
  });

  const upcomingLessons = useMemo(() => {
    const now = dayjs();
    const list = Array.isArray(upcomingCal.data) ? upcomingCal.data : [];
    return list
      .filter((e) => {
        if (e.type !== 'LIVE') return false;
        if (!e.lessonId) return false;
        const at = dayjs(e.startsAt);
        return (
          (at.isAfter(now) || at.isSame(now, 'minute')) &&
          !at.isAfter(upcomingTo)
        );
      })
      .sort((a, b) => dayjs(a.startsAt).valueOf() - dayjs(b.startsAt).valueOf())
      .slice(0, 5);
  }, [upcomingCal.data, upcomingTo]);

  return (
    <div style={{ maxWidth: 1100 }}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <WeekStripCalendar
          events={Array.isArray(cal.data) ? cal.data : []}
          onRangeChange={onWeekRangeChange}
        />
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
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                      }}
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

      <div style={{ marginTop: 28, marginBottom: 12 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Ближайшие уроки
        </Typography.Title>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          На ближайшие 7 дней · до 5 занятий
        </Typography.Text>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="visible"
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {upcomingLessons.map((e, i) => {
          const kind = resolveLessonKind({
            type: e.lessonType,
            meetingUrl: e.meetingUrl,
            hasVideo: e.lessonHasVideo,
          });
          const accent = lessonKindAccent(kind);
          return (
          <motion.div key={e.id} variants={fadeUp} custom={i}>
            <motion.div
              whileHover={{
                y: -4,
                boxShadow: '0 10px 24px rgba(107, 79, 184, 0.12)',
              }}
              transition={{ duration: 0.22 }}
              style={{
                background: '#fff',
                border: '1px solid #ebebeb',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                gap: 14,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: accent.bg,
                  color: accent.color,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  fontSize: 18,
                }}
              >
                <LessonTypeIcon
                  lesson={{
                    type: e.lessonType,
                    meetingUrl: e.meetingUrl,
                    hasVideo: e.lessonHasVideo,
                  }}
                  style={{ marginTop: 0, color: accent.color }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography.Text strong style={{ display: 'block' }}>
                  {e.title}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                  {lessonKindLabel(kind)} ·{' '}
                  {dayjs(e.startsAt).format('D MMM, HH:mm')}
                  {e.course?.title ? ` · ${e.course.title}` : ''}
                </Typography.Text>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                }}
              >
                {e.meetingUrl && e.contentOpen !== false ? (
                  <motion.a
                    href={e.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    whileHover={{ y: -1, background: '#f5f5f5', borderColor: '#d9d9d9' }}
                    whileTap={{ scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '7px 12px',
                      borderRadius: 10,
                      border: '1px solid #ebebeb',
                      background: '#fff',
                      color: '#434343',
                      textDecoration: 'none',
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    Встреча
                  </motion.a>
                ) : null}
                {e.lessonId ? (
                  <Link to={`/lk/lessons/${e.lessonId}`} style={{ textDecoration: 'none' }}>
                    <motion.span
                      whileHover={{
                        y: -1,
                        background: '#f5f5f5',
                        borderColor: '#d9d9d9',
                      }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '7px 12px',
                        borderRadius: 10,
                        background: '#fff',
                        color: '#434343',
                        fontSize: 13,
                        fontWeight: 500,
                        border: '1px solid #ebebeb',
                        cursor: 'pointer',
                      }}
                    >
                      К уроку
                      <span aria-hidden style={{ fontSize: 13, opacity: 0.55, lineHeight: 1 }}>
                        →
                      </span>
                    </motion.span>
                  </Link>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
          );
        })}
        {!upcomingCal.isLoading && upcomingLessons.length === 0 ? (
          <Typography.Text type="secondary">
            На ближайшие 7 дней занятий нет
          </Typography.Text>
        ) : null}
      </motion.div>
    </div>
  );
}
