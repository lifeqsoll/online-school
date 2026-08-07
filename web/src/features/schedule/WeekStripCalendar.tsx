import { Modal, Typography } from 'antd';
import { CheckCircleFilled, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import 'dayjs/locale/ru';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { easeOutExpo } from '../../shared/motion';
import { courseColor } from '../../shared/schedule/courseColor';
import { FileList } from '../../shared/files/FileList';

dayjs.extend(isoWeek);
dayjs.locale('ru');

export type CalEvent = {
  id: string;
  title: string;
  type: 'LIVE' | 'DEADLINE';
  startsAt: string;
  endsAt?: string | null;
  meetingUrl?: string | null;
  lessonId?: string | null;
  /** Lesson content type: VIDEO | TEXT | MIXED */
  lessonType?: string | null;
  lessonHasVideo?: boolean;
  assignmentId?: string | null;
  contentOpen?: boolean;
  /** Standalone DEADLINE: student already submitted */
  assignmentDone?: boolean;
  course?: { id: string; title: string };
  /** HW linked to this lesson (LIVE events) */
  linkedAssignments?: Array<{ id: string; title: string; done?: boolean }>;
};

type Props = {
  events: CalEvent[];
  loading?: boolean;
  /** Called when visible week/month range changes (ISO strings) */
  onRangeChange?: (range: { from: string; to: string }) => void;
};

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Lesson-linked HW lives inside the lesson modal — hide separate deadline chips. */
function visibleDayEvents(events: CalEvent[]) {
  const list = Array.isArray(events) ? events : [];
  return list.filter((e) => !(e.type === 'DEADLINE' && e.lessonId));
}

function eventsOnDay(events: CalEvent[], day: Dayjs) {
  return visibleDayEvents(events).filter((e) =>
    dayjs(e.startsAt).isSame(day, 'day'),
  );
}

function EventChip({
  event,
  onClick,
}: {
  event: CalEvent;
  onClick: () => void;
}) {
  const isLive = event.type === 'LIVE';
  const hwCount = event.linkedAssignments?.length ?? 0;
  const colors = event.course?.id
    ? courseColor(event.course.id)
    : {
        bg: isLive ? 'var(--accent-soft)' : '#fff7e6',
        border: isLive ? 'var(--accent)' : '#faad14',
        text: 'var(--fg)',
      };
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03, y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.18, ease: easeOutExpo }}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        borderRadius: 6,
        padding: '4px 6px',
        marginBottom: 4,
        cursor: 'pointer',
        background: colors.bg,
        borderLeft: `${isLive ? 4 : 3}px ${isLive ? 'solid' : 'dashed'} ${colors.border}`,
        fontSize: 11,
        lineHeight: 1.3,
        color: colors.text,
      }}
    >
      <div style={{ fontWeight: 600 }}>
        {dayjs(event.startsAt).format('HH:mm')} · {isLive ? 'Урок' : 'Дедлайн'}
        {hwCount > 0 ? ` · ДЗ` : ''}
        {!isLive && event.assignmentDone ? ' ✓' : ''}
      </div>
      <div
        style={{
          opacity: 0.85,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {event.title}
      </div>
    </motion.button>
  );
}

function EventModal({
  event,
  open,
  onClose,
}: {
  event: CalEvent | null;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  if (!event) return null;
  const isLive = event.type === 'LIVE';
  const linked = event.linkedAssignments ?? [];

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={isLive ? 'Онлайн-урок' : 'Дедлайн ДЗ'}
      destroyOnClose
    >
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {event.title}
      </Typography.Title>
      {event.course && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
          Курс:{' '}
          <a
            href={`/lk/courses/${event.course.id}`}
            onClick={(e) => {
              e.preventDefault();
              onClose();
              navigate(`/lk/courses/${event.course!.id}`);
            }}
          >
            {event.course.title}
          </a>
        </Typography.Paragraph>
      )}
      <Typography.Paragraph>
        {dayjs(event.startsAt).format('D MMMM YYYY, HH:mm')}
        {event.endsAt ? ` — ${dayjs(event.endsAt).format('HH:mm')}` : ''}
        {!isLive && event.assignmentDone ? (
          <span style={{ marginLeft: 10, color: '#52c41a' }}>
            <CheckCircleFilled /> Сдано
          </span>
        ) : null}
      </Typography.Paragraph>
      {isLive && event.meetingUrl && event.contentOpen !== false && (
        <a href={event.meetingUrl} target="_blank" rel="noreferrer">
          Ссылка на встречу
        </a>
      )}
      {isLive && event.contentOpen === false ? (
        <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
          Материалы и ссылка откроются ближе к дате урока
        </Typography.Paragraph>
      ) : null}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isLive && event.lessonId && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              onClose();
              navigate(`/lk/lessons/${event.lessonId}`);
            }}
            style={primaryBtn}
          >
            Перейти к уроку
          </motion.button>
        )}
        {event.course && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              onClose();
              navigate(`/lk/courses/${event.course!.id}`);
            }}
            style={{
              ...primaryBtn,
              background: '#fff',
              color: 'var(--fg)',
              border: '1px solid var(--border)',
            }}
          >
            К курсу
          </motion.button>
        )}
        {!isLive && event.assignmentId && event.course && (
          <motion.button
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              onClose();
              navigate(`/lk/assignments/${event.assignmentId}`);
            }}
            style={primaryBtn}
          >
            К заданию
          </motion.button>
        )}
      </div>

      {isLive && linked.length > 0 ? (
        <div style={{ marginTop: 20 }}>
          <Typography.Title level={5} style={{ marginBottom: 8 }}>
            Домашнее задание
          </Typography.Title>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {linked.map((a) => (
              <motion.button
                key={a.id}
                type="button"
                whileHover={{ scale: 1.01, x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  onClose();
                  navigate(`/lk/assignments/${a.id}`);
                }}
                style={{
                  ...primaryBtn,
                  background: a.done ? '#f6ffed' : '#fff7e6',
                  color: 'var(--fg)',
                  border: `1px solid ${a.done ? '#b7eb8f' : '#ffe58f'}`,
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span>ДЗ: {a.title}</span>
                {a.done ? (
                  <span style={{ color: '#52c41a', flexShrink: 0 }}>
                    <CheckCircleFilled /> Сдано
                  </span>
                ) : null}
              </motion.button>
            ))}
          </div>
        </div>
      ) : null}

      <Typography.Title level={5} style={{ marginTop: 20, marginBottom: 8 }}>
        Материалы
      </Typography.Title>
      <FileList
        ownerType="COURSE_EVENT_MATERIAL"
        ownerId={event.id}
        canDelete={false}
      />
    </Modal>
  );
}

const primaryBtn: CSSProperties = {
  border: 'none',
  borderRadius: 8,
  padding: '8px 14px',
  background: 'var(--accent)',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const navBtn: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--bg)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function WeekStripCalendar({ events, onRangeChange }: Props) {
  const safeEvents = Array.isArray(events) ? events : [];
  const [anchor, setAnchor] = useState(() => dayjs());
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [dir, setDir] = useState(0);

  const weekStart = anchor.startOf('isoWeek');
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')),
    [weekStart],
  );

  useEffect(() => {
    onRangeChange?.({
      from: weekStart.startOf('day').toISOString(),
      to: weekStart.add(6, 'day').endOf('day').toISOString(),
    });
  }, [weekStart, onRangeChange]);

  const shiftWeek = (delta: number) => {
    setDir(delta);
    setAnchor((a) => a.add(delta, 'week'));
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <motion.button
          type="button"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => shiftWeek(-1)}
          style={navBtn}
          aria-label="Предыдущая неделя"
        >
          <LeftOutlined />
        </motion.button>
        <Typography.Text strong style={{ textTransform: 'capitalize' }}>
          {weekStart.format('D MMM')} — {weekStart.add(6, 'day').format('D MMM YYYY')}
        </Typography.Text>
        <motion.button
          type="button"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => shiftWeek(1)}
          style={navBtn}
          aria-label="Следующая неделя"
        >
          <RightOutlined />
        </motion.button>
      </div>

      <div style={{ overflow: 'hidden' }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={weekStart.format('YYYY-MM-DD')}
            custom={dir}
            initial={{ opacity: 0, x: dir >= 0 ? 40 : -40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir >= 0 ? -40 : 40 }}
            transition={{ duration: 0.28, ease: easeOutExpo }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: 8,
            }}
          >
            {days.map((day, i) => {
              const dayEvents = eventsOnDay(safeEvents, day);
              const isToday = day.isSame(dayjs(), 'day');
              return (
                <motion.div
                  key={day.format('YYYY-MM-DD')}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: i * 0.03, ease: easeOutExpo }}
                  style={{
                    minHeight: 120,
                    borderRadius: 10,
                    border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
                    background: isToday ? 'var(--accent-soft)' : 'var(--bg)',
                    padding: 8,
                  }}
                >
                  <div style={{ marginBottom: 6, fontSize: 12, color: 'var(--muted)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--fg)' }}>{WEEKDAYS[i]}</span>{' '}
                    {day.format('D')}
                  </div>
                  {dayEvents.map((ev) => (
                    <EventChip key={ev.id} event={ev} onClick={() => setSelected(ev)} />
                  ))}
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <EventModal event={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}

export function MonthGridCalendar({ events, onRangeChange }: Props) {
  const safeEvents = Array.isArray(events) ? events : [];
  const [anchor, setAnchor] = useState(() => dayjs());
  const [selected, setSelected] = useState<CalEvent | null>(null);
  const [dir, setDir] = useState(0);

  const monthStart = anchor.startOf('month');
  const gridStart = monthStart.startOf('isoWeek');
  const cells = useMemo(
    () => Array.from({ length: 42 }, (_, i) => gridStart.add(i, 'day')),
    [gridStart],
  );

  useEffect(() => {
    onRangeChange?.({
      from: gridStart.startOf('day').toISOString(),
      to: gridStart.add(41, 'day').endOf('day').toISOString(),
    });
  }, [gridStart, onRangeChange]);

  const shiftMonth = (delta: number) => {
    setDir(delta);
    setAnchor((a) => a.add(delta, 'month'));
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <motion.button
          type="button"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => shiftMonth(-1)}
          style={navBtn}
          aria-label="Предыдущий месяц"
        >
          <LeftOutlined />
        </motion.button>
        <Typography.Text strong style={{ textTransform: 'capitalize' }}>
          {anchor.format('MMMM YYYY')}
        </Typography.Text>
        <motion.button
          type="button"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => shiftMonth(1)}
          style={navBtn}
          aria-label="Следующий месяц"
        >
          <RightOutlined />
        </motion.button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 4,
          marginBottom: 6,
        }}
      >
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}
          >
            {d}
          </div>
        ))}
      </div>

      <div style={{ overflow: 'hidden' }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={monthStart.format('YYYY-MM')}
            custom={dir}
            initial={{ opacity: 0, x: dir >= 0 ? 48 : -48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir >= 0 ? -48 : 48 }}
            transition={{ duration: 0.3, ease: easeOutExpo }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
              gap: 4,
            }}
          >
            {cells.map((day) => {
              const inMonth = day.month() === anchor.month();
              const isToday = day.isSame(dayjs(), 'day');
              const dayEvents = eventsOnDay(safeEvents, day);
              return (
                <div
                  key={day.format('YYYY-MM-DD')}
                  style={{
                    minHeight: 88,
                    borderRadius: 8,
                    border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
                    background: !inMonth
                      ? 'var(--surface)'
                      : isToday
                        ? 'var(--accent-soft)'
                        : 'var(--bg)',
                    padding: 6,
                    opacity: inMonth ? 1 : 0.55,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    {day.format('D')}
                  </div>
                  {dayEvents.slice(0, 3).map((ev) => (
                    <EventChip key={ev.id} event={ev} onClick={() => setSelected(ev)} />
                  ))}
                  {dayEvents.length > 3 && (
                    <Typography.Text type="secondary" style={{ fontSize: 10 }}>
                      +{dayEvents.length - 3}
                    </Typography.Text>
                  )}
                </div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <EventModal event={selected} open={!!selected} onClose={() => setSelected(null)} />
    </div>
  );
}
