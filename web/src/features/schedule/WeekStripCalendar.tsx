import { Modal, Typography } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import 'dayjs/locale/ru';
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';

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
  assignmentId?: string | null;
  course?: { id: string; title: string };
};

type Props = {
  events: CalEvent[];
};

/** Month grid: weeks × 7 days */
export function MonthGridCalendar({ events }: Props) {
  const nav = useNavigate();
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [selected, setSelected] = useState<CalEvent | null>(null);

  const days = useMemo(() => {
    const start = month.startOf('month').startOf('isoWeek');
    const end = month.endOf('month').endOf('isoWeek');
    const out: Dayjs[] = [];
    let d = start;
    while (d.isBefore(end) || d.isSame(end, 'day')) {
      out.push(d);
      d = d.add(1, 'day');
    }
    return out;
  }, [month]);

  const byDay = (d: Dayjs) =>
    events.filter((e) => dayjs(e.startsAt).isSame(d, 'day'));

  const weeks = useMemo(() => {
    const rows: Dayjs[][] = [];
    for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7));
    return rows;
  }, [days]);

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #ebebeb',
        padding: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Typography.Text strong style={{ textTransform: 'capitalize' }}>
          {month.format('MMMM YYYY')}
        </Typography.Text>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            aria-label="Предыдущий месяц"
            onClick={() => setMonth((m) => m.subtract(1, 'month'))}
            style={navBtn}
          >
            <LeftOutlined />
          </button>
          <button
            type="button"
            aria-label="Следующий месяц"
            onClick={() => setMonth((m) => m.add(1, 'month'))}
            style={navBtn}
          >
            <RightOutlined />
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 6,
          marginBottom: 6,
        }}
      >
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((w) => (
          <div
            key={w}
            style={{
              textAlign: 'center',
              fontSize: 12,
              color: '#8c8c8c',
              textTransform: 'uppercase',
            }}
          >
            {w}
          </div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div
          key={wi}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            gap: 6,
            marginBottom: 6,
          }}
        >
          {week.map((d) => {
            const dayEvents = byDay(d);
            const inMonth = d.month() === month.month();
            const isToday = d.isSame(dayjs(), 'day');
            const deadlines = dayEvents.filter((e) => e.type === 'DEADLINE').length;
            return (
              <div
                key={d.toISOString()}
                style={{
                  minHeight: 88,
                  borderRadius: 12,
                  border: '1px solid #f0f0f0',
                  padding: 6,
                  background: isToday ? 'var(--accent-soft)' : inMonth ? '#fff' : '#fafafa',
                  opacity: inMonth ? 1 : 0.55,
                }}
              >
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 13,
                    background: isToday ? 'var(--accent)' : 'transparent',
                    color: isToday ? '#fff' : '#333',
                    marginBottom: 4,
                  }}
                >
                  {d.format('D')}
                </div>
                {deadlines > 0 ? (
                  <div style={{ fontSize: 10, color: '#8c8c8c', marginBottom: 4 }}>
                    Дедлайн {deadlines}
                  </div>
                ) : null}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {dayEvents.slice(0, 3).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelected(e)}
                      style={{
                        textAlign: 'left',
                        border: 'none',
                        borderRadius: 6,
                        padding: '3px 5px',
                        background: e.type === 'LIVE' ? '#e8f3ff' : '#f3eeff',
                        cursor: 'pointer',
                        fontSize: 10,
                        lineHeight: 1.2,
                      }}
                    >
                      {dayjs(e.startsAt).format('HH:mm')} {e.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 ? (
                    <span style={{ fontSize: 10, color: '#8c8c8c' }}>
                      +{dayEvents.length - 3}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <Modal
        open={!!selected}
        title={selected?.title}
        onCancel={() => setSelected(null)}
        footer={null}
      >
        {selected ? (
          <div>
            <Typography.Paragraph>
              {selected.type === 'LIVE' ? 'Занятие' : 'Дедлайн'} ·{' '}
              {dayjs(selected.startsAt).format('DD.MM.YYYY HH:mm')}
            </Typography.Paragraph>
            {selected.course ? (
              <Typography.Paragraph type="secondary">
                {selected.course.title}
              </Typography.Paragraph>
            ) : null}
            {selected.meetingUrl ? (
              <Typography.Paragraph>
                <a href={selected.meetingUrl} target="_blank" rel="noreferrer">
                  Ссылка на встречу
                </a>
              </Typography.Paragraph>
            ) : null}
            {selected.lessonId ? (
              <a
                onClick={() => {
                  setSelected(null);
                  nav(`/lk/lessons/${selected.lessonId}`);
                }}
              >
                Открыть урок
              </a>
            ) : null}
            {selected.assignmentId ? (
              <div>
                <a
                  onClick={() => {
                    setSelected(null);
                    nav(`/lk/assignments/${selected.assignmentId}`);
                  }}
                >
                  Открыть ДЗ
                </a>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/** Compact week strip (course page) */
export function WeekStripCalendar({
  events,
  daysCount = 7,
}: {
  events: CalEvent[];
  daysCount?: number;
}) {
  const nav = useNavigate();
  const [anchor, setAnchor] = useState(() => dayjs().startOf('day'));
  const [selected, setSelected] = useState<CalEvent | null>(null);

  const days = useMemo(
    () => Array.from({ length: daysCount }, (_, i) => anchor.add(i, 'day')),
    [anchor, daysCount],
  );

  const byDay = (d: Dayjs) =>
    events.filter((e) => dayjs(e.startsAt).isSame(d, 'day'));

  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        border: '1px solid #ebebeb',
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => setAnchor((a) => a.subtract(daysCount, 'day'))}
          style={navBtn}
        >
          <LeftOutlined />
        </button>
        <button
          type="button"
          onClick={() => setAnchor((a) => a.add(daysCount, 'day'))}
          style={navBtn}
        >
          <RightOutlined />
        </button>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${daysCount}, minmax(0, 1fr))`,
          gap: 8,
        }}
      >
        {days.map((d) => {
          const dayEvents = byDay(d);
          const isToday = d.isSame(dayjs(), 'day');
          return (
            <div key={d.toISOString()}>
              <div style={{ textAlign: 'center', marginBottom: 8 }}>
                <div
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: 12,
                    background: isToday ? 'var(--accent)' : 'transparent',
                    color: isToday ? '#fff' : 'inherit',
                  }}
                >
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{d.format('D')}</span>
                  <span style={{ fontSize: 11, textTransform: 'uppercase' }}>
                    {d.format('dd')}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>
                  Дедлайн {dayEvents.filter((e) => e.type === 'DEADLINE').length}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dayEvents.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelected(e)}
                    style={{
                      textAlign: 'left',
                      border: 'none',
                      borderRadius: 10,
                      padding: '8px 10px',
                      background: e.type === 'LIVE' ? '#e8f3ff' : '#f3eeff',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>
                      {dayjs(e.startsAt).format('HH:mm')} ·{' '}
                      {e.type === 'LIVE' ? 'Занятие' : 'Дедлайн'}
                    </div>
                    <div style={{ color: '#555' }}>{e.title}</div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <Modal
        open={!!selected}
        title={selected?.title}
        onCancel={() => setSelected(null)}
        footer={null}
      >
        {selected?.assignmentId ? (
          <a
            onClick={() => {
              setSelected(null);
              nav(`/lk/assignments/${selected.assignmentId}`);
            }}
          >
            Открыть ДЗ
          </a>
        ) : selected?.lessonId ? (
          <a
            onClick={() => {
              setSelected(null);
              nav(`/lk/lessons/${selected.lessonId}`);
            }}
          >
            Открыть урок
          </a>
        ) : (
          <Typography.Text type="secondary">Нет ссылки</Typography.Text>
        )}
      </Modal>
    </div>
  );
}

const navBtn: CSSProperties = {
  border: '1px solid #ebebeb',
  background: '#fff',
  borderRadius: 8,
  width: 32,
  height: 32,
  cursor: 'pointer',
};
