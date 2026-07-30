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
  daysCount?: number;
};

export function WeekStripCalendar({ events, daysCount = 7 }: Props) {
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
          aria-label="Назад"
          onClick={() => setAnchor((a) => a.subtract(daysCount, 'day'))}
          style={navBtn}
        >
          <LeftOutlined />
        </button>
        <button
          type="button"
          aria-label="Вперёд"
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
          minHeight: 160,
        }}
      >
        {days.map((d) => {
          const dayEvents = byDay(d);
          const deadlines = dayEvents.filter((e) => e.type === 'DEADLINE').length;
          const isToday = d.isSame(dayjs(), 'day');
          return (
            <div key={d.toISOString()} style={{ minWidth: 0 }}>
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
                  <span style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.1 }}>
                    {d.format('D')}
                  </span>
                  <span style={{ fontSize: 11, textTransform: 'uppercase' }}>
                    {d.format('dd')}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 6 }}>
                  Дедлайн {deadlines}
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

const navBtn: CSSProperties = {
  border: '1px solid #ebebeb',
  background: '#fff',
  borderRadius: 8,
  width: 32,
  height: 32,
  cursor: 'pointer',
};
