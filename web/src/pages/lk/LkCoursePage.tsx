import { useQuery } from '@tanstack/react-query';
import { Badge, Switch, Typography } from 'antd';
import {
  ArrowLeftOutlined,
  StarFilled,
  FormOutlined,
  NotificationOutlined,
  DownOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../shared/api/client';
import { assignmentTypeLabel } from '../../shared/assignments/labels';
import { LessonTypeIcon } from '../../shared/lessons/lessonTypeIcon';
import {
  WeekStripCalendar,
  type CalEvent,
} from '../../features/schedule/WeekStripCalendar';
import { easeOutExpo, tabPanelVariants } from '../../shared/motion';
import { SupportPanel } from '../../features/support/SupportPanel';
import { useClearSupportBadge } from '../../shared/notifications/useClearSupportBadge';
import { useUnreadCounts } from '../../shared/notifications/NotificationsBell';

dayjs.extend(isoWeek);

type CourseDetail = {
  id: string;
  title: string;
  modules: Array<{
    id: string;
    title: string;
    radarLabel?: string | null;
    lessons: Array<{
      id: string;
      title: string;
      type?: string;
      scheduledAt?: string | null;
      meetingUrl?: string | null;
      contentOpen?: boolean;
      unlocksAt?: string | null;
    }>;
  }>;
};

type Assignment = {
  id: string;
  title: string;
  maxXp: number;
  dueAt?: string | null;
  description?: string | null;
  responseMode?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
  scope?: string | null;
  questions?: Array<{ type: string }>;
};

type CourseReminder = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

export function LkCoursePage() {
  const { courseId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') || 'modules';
  const nav = useNavigate();
  const [hideSchedule, setHideSchedule] = useState(false);
  const [openModules, setOpenModules] = useState<string[]>([]);
  const unread = useUnreadCounts();
  useClearSupportBadge(tab === 'curator' ? 'COURSE' : undefined);

  const defaultWeekRange = useCallback(() => {
    const start = dayjs().startOf('isoWeek');
    return {
      from: start.startOf('day').toISOString(),
      to: start.add(6, 'day').endOf('day').toISOString(),
    };
  }, []);
  const [weekRange, setWeekRange] = useState(defaultWeekRange);
  const onWeekRangeChange = useCallback(
    (range: { from: string; to: string }) => {
      setWeekRange((prev) =>
        prev.from === range.from && prev.to === range.to ? prev : range,
      );
    },
    [],
  );

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

  const reminders = useQuery({
    queryKey: ['course-reminders-student', courseId],
    queryFn: () => api<CourseReminder[]>(`/courses/${courseId}/reminders`),
    enabled: !!courseId,
  });

  const cal = useQuery({
    queryKey: [
      'course-events-student',
      courseId,
      weekRange.from,
      weekRange.to,
    ],
    queryFn: () =>
      api<CalEvent[]>(
        `/courses/${courseId}/events?from=${encodeURIComponent(weekRange.from)}&to=${encodeURIComponent(weekRange.to)}`,
      ),
    enabled: !!courseId,
  });

  const lessons = useMemo(
    () =>
      (course.data?.modules ?? []).flatMap((m) =>
        m.lessons.map((l) => ({ ...l, moduleTitle: m.title, moduleId: m.id })),
      ),
    [course.data],
  );

  const lessonModuleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lessons) map.set(l.id, l.moduleId);
    return map;
  }, [lessons]);

  const hwByModule = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    const courseLevel: Assignment[] = [];
    for (const a of assignments.data ?? []) {
      let moduleId = a.moduleId ?? null;
      if (!moduleId && a.lessonId) {
        moduleId = lessonModuleMap.get(a.lessonId) ?? null;
      }
      if (!moduleId) {
        courseLevel.push(a);
        continue;
      }
      const list = map.get(moduleId) ?? [];
      list.push(a);
      map.set(moduleId, list);
    }
    return { map, courseLevel };
  }, [assignments.data, lessonModuleMap]);

  if (!course.data) return <Typography.Text>Загрузка…</Typography.Text>;

  const tabs = [
    { key: 'modules', label: 'Модули' },
    { key: 'lessons', label: 'Уроки' },
    { key: 'hw', label: 'Домашки' },
    {
      key: 'curator',
      label: 'Куратор',
      badge: unread.data?.supportCourse ?? 0,
    },
  ];

  const toggleModule = (id: string) => {
    setOpenModules((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

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

      {!hideSchedule ? (
        <WeekStripCalendar
          events={Array.isArray(cal.data) ? cal.data : []}
          onRangeChange={onWeekRangeChange}
        />
      ) : null}

      <div
        style={{
          display: 'flex',
          gap: 20,
          marginTop: 20,
          marginBottom: 14,
          borderBottom: '1px solid #ebebeb',
          flexWrap: 'wrap',
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
              color:
                tab === t.key
                  ? '#6b4fb8'
                  : (t as { badge?: number }).badge
                    ? '#6b4fb8'
                    : '#8c8c8c',
              position: 'relative',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {t.label}
              {(t as { badge?: number }).badge ? (
                <Badge
                  count={(t as { badge?: number }).badge}
                  size="small"
                  color="#6b4fb8"
                />
              ) : null}
            </span>
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
          {tab === 'modules' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(course.data.modules ?? []).map((m, i) => {
                const open = openModules.includes(m.id);
                const moduleHw = hwByModule.map.get(m.id) ?? [];
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.28, ease: easeOutExpo }}
                    style={{
                      background: '#fff',
                      border: '1px solid #ebebeb',
                      borderRadius: 14,
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleModule(m.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 16px',
                        border: 'none',
                        background: open ? 'rgba(190,170,242,0.16)' : '#fff',
                        cursor: 'pointer',
                        textAlign: 'left',
                        font: 'inherit',
                      }}
                    >
                      <motion.span
                        animate={{ rotate: open ? 180 : 0 }}
                        transition={{ duration: 0.22, ease: easeOutExpo }}
                        style={{ color: '#6b4fb8', display: 'inline-flex' }}
                      >
                        <DownOutlined />
                      </motion.span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{m.title}</div>
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
                          {m.lessons.length} ур. · {moduleHw.length} ДЗ
                        </div>
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {open ? (
                        <motion.div
                          key="body"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: easeOutExpo }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div
                            style={{
                              padding: '4px 16px 16px',
                              borderTop: '1px solid #f0f0f0',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 8,
                            }}
                          >
                            {m.lessons.length === 0 && moduleHw.length === 0 ? (
                              <Typography.Text type="secondary">
                                В модуле пока нет уроков и ДЗ
                              </Typography.Text>
                            ) : null}

                            {m.lessons.map((l) => (
                              <div key={l.id}>
                                <Link
                                  to={`/lk/lessons/${l.id}`}
                                  style={{ textDecoration: 'none', color: 'inherit' }}
                                >
                                  <motion.div whileHover={{ y: -1 }} style={innerCard}>
                                    <LessonTypeIcon lesson={l} />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 11, color: '#69b1ff' }}>
                                        Урок
                                        {l.contentOpen === false ? ' · скоро' : ''}
                                      </div>
                                      <div style={{ fontWeight: 600 }}>{l.title}</div>
                                    </div>
                                  </motion.div>
                                </Link>
                                {(assignments.data ?? [])
                                  .filter((a) => a.lessonId === l.id)
                                  .map((a) => (
                                    <Link
                                      key={a.id}
                                      to={`/lk/assignments/${a.id}`}
                                      style={{
                                        textDecoration: 'none',
                                        color: 'inherit',
                                        display: 'block',
                                        marginTop: 6,
                                        marginLeft: 18,
                                      }}
                                    >
                                      <motion.div whileHover={{ y: -1 }} style={innerCard}>
                                        <FormOutlined
                                          style={{ color: '#faad14', marginTop: 3 }}
                                        />
                                        <div style={{ flex: 1 }}>
                                          <div style={{ fontSize: 11, color: '#d48806' }}>
                                            ДЗ к уроку
                                            {a.dueAt
                                              ? ` · ${dayjs(a.dueAt).format('D MMM')}`
                                              : ''}
                                          </div>
                                          <div style={{ fontWeight: 600 }}>{a.title}</div>
                                        </div>
                                        <Typography.Text>
                                          <StarFilled style={{ color: '#faad14' }} /> +
                                          {a.maxXp}
                                        </Typography.Text>
                                      </motion.div>
                                    </Link>
                                  ))}
                              </div>
                            ))}

                            {moduleHw
                              .filter((a) => !a.lessonId)
                              .map((a) => (
                                <Link
                                  key={a.id}
                                  to={`/lk/assignments/${a.id}`}
                                  style={{ textDecoration: 'none', color: 'inherit' }}
                                >
                                  <motion.div whileHover={{ y: -1 }} style={innerCard}>
                                    <FormOutlined
                                      style={{ color: '#faad14', marginTop: 3 }}
                                    />
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 11, color: '#d48806' }}>
                                        ДЗ модуля
                                        {a.dueAt
                                          ? ` · ${dayjs(a.dueAt).format('D MMM')}`
                                          : ''}
                                      </div>
                                      <div style={{ fontWeight: 600 }}>{a.title}</div>
                                    </div>
                                    <Typography.Text>
                                      <StarFilled style={{ color: '#faad14' }} /> +
                                      {a.maxXp}
                                    </Typography.Text>
                                  </motion.div>
                                </Link>
                              ))}
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </motion.div>
                );
              })}

              {!course.data.modules.length ? (
                <Typography.Text type="secondary">Модулей пока нет</Typography.Text>
              ) : null}

              {hwByModule.courseLevel.length ? (
                <div
                  style={{
                    marginTop: 8,
                    padding: 16,
                    background: '#fafafa',
                    borderRadius: 14,
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <Typography.Text strong style={{ display: 'block', marginBottom: 10 }}>
                    ДЗ всего курса
                  </Typography.Text>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {hwByModule.courseLevel.map((a) => (
                      <Link
                        key={a.id}
                        to={`/lk/assignments/${a.id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        <motion.div whileHover={{ y: -1 }} style={innerCard}>
                          <FormOutlined style={{ color: '#faad14', marginTop: 3 }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600 }}>{a.title}</div>
                          </div>
                          <Typography.Text>
                            <StarFilled style={{ color: '#faad14' }} /> +{a.maxXp}
                          </Typography.Text>
                        </motion.div>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: 8 }}>
                <Typography.Title level={5} style={{ marginTop: 8 }}>
                  <NotificationOutlined style={{ marginRight: 8, color: '#6b4fb8' }} />
                  Напоминания куратора
                </Typography.Title>
                <RemindersList
                  items={reminders.data ?? []}
                  loading={reminders.isLoading}
                />
              </div>
            </div>
          ) : null}

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
                      <LessonTypeIcon lesson={l} />
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
          ) : null}

          {tab === 'hw' ? (
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
          ) : null}

          {tab === 'curator' ? (
            <SupportPanel
              mode="mine"
              channel="COURSE"
              courseId={courseId}
              title="Связь с куратором"
              allowCreate
            />
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function RemindersList({
  items,
  loading,
}: {
  items: CourseReminder[];
  loading?: boolean;
}) {
  if (loading) {
    return <Typography.Text type="secondary">Загрузка…</Typography.Text>;
  }
  if (!items.length) {
    return (
      <Typography.Text type="secondary">
        Напоминаний от куратора пока нет
      </Typography.Text>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((r, i) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.24, ease: easeOutExpo }}
          style={{
            ...cardStyle,
            flexDirection: 'column',
            gap: 6,
            background: 'rgba(190,170,242,0.1)',
            borderColor: '#e4daf8',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <Typography.Text strong>{r.title}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {dayjs(r.createdAt).format('D MMM YYYY, HH:mm')}
            </Typography.Text>
          </div>
          <Typography.Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {r.body}
          </Typography.Paragraph>
        </motion.div>
      ))}
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

const innerCard: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'flex-start',
  background: '#fafafa',
  border: '1px solid #f0f0f0',
  borderRadius: 12,
  padding: '10px 12px',
};

const backBtn: CSSProperties = {
  border: '1px solid #ebebeb',
  background: '#fff',
  borderRadius: 10,
  padding: '6px 12px',
  cursor: 'pointer',
};
