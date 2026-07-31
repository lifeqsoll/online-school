import { Badge, List, Modal, Segmented, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileList } from '../../shared/files/FileList';

dayjs.extend(isoWeek);

export type CalEvent = {
  id: string;
  title: string;
  type: 'LIVE' | 'DEADLINE';
  startsAt: string;
  endsAt?: string | null;
  meetingUrl?: string | null;
  lessonId?: string | null;
  assignmentId?: string | null;
  description?: string | null;
  course?: { id: string; title: string };
};

type Props = {
  events: CalEvent[];
  mode?: 'week' | 'month';
  onModeChange?: (m: 'week' | 'month') => void;
  /** Right-click empty day → create (staff calendar) */
  onCreateAtDay?: (day: Dayjs) => void;
  /** Click existing event → edit (staff). If omitted, opens read-only detail. */
  onEditEvent?: (event: CalEvent) => void;
};

export function CalendarView({
  events,
  mode = 'week',
  onModeChange,
  onCreateAtDay,
  onEditEvent,
}: Props) {
  const nav = useNavigate();
  const [anchor, setAnchor] = useState(() => dayjs());
  const [selected, setSelected] = useState<CalEvent | null>(null);

  const days = useMemo(() => {
    if (mode === 'week') {
      const start = anchor.startOf('isoWeek');
      return Array.from({ length: 7 }, (_, i) => start.add(i, 'day'));
    }
    const start = anchor.startOf('month').startOf('isoWeek');
    return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'));
  }, [anchor, mode]);

  const byDay = (d: Dayjs) =>
    events.filter((e) => dayjs(e.startsAt).isSame(d, 'day'));

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Typography.Text>
          <a
            onClick={() =>
              setAnchor((a) => a.subtract(1, mode === 'week' ? 'week' : 'month'))
            }
          >
            ←
          </a>{' '}
          {mode === 'week'
            ? `${days[0].format('D MMM')} — ${days[6].format('D MMM YYYY')}`
            : anchor.format('MMMM YYYY')}{' '}
          <a
            onClick={() =>
              setAnchor((a) => a.add(1, mode === 'week' ? 'week' : 'month'))
            }
          >
            →
          </a>
        </Typography.Text>
        {onModeChange ? (
          <Segmented
            value={mode}
            onChange={(v) => onModeChange(v as 'week' | 'month')}
            options={[
              { label: 'Неделя', value: 'week' },
              { label: 'Месяц', value: 'month' },
            ]}
          />
        ) : null}
      </div>

      {onCreateAtDay ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 8, fontSize: 12 }}>
          ПКМ по дню — создать событие · клик по событию — редактировать
        </Typography.Paragraph>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {days.slice(0, mode === 'week' ? 7 : 42).map((d) => {
          const dayEvents = byDay(d);
          return (
            <div
              key={d.toISOString()}
              onContextMenu={(e) => {
                if (!onCreateAtDay) return;
                e.preventDefault();
                onCreateAtDay(d);
              }}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 8,
                minHeight: mode === 'week' ? 120 : 72,
                background: d.isSame(dayjs(), 'day') ? 'var(--accent-soft)' : '#fff',
                cursor: onCreateAtDay ? 'context-menu' : undefined,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {d.format('dd D')}
              </Typography.Text>
              <List
                size="small"
                dataSource={dayEvents}
                split={false}
                renderItem={(e) => (
                  <List.Item
                    style={{ padding: '4px 0', cursor: 'pointer' }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      if (onEditEvent) onEditEvent(e);
                      else setSelected(e);
                    }}
                    onContextMenu={(ev) => {
                      // Don't open create when right-clicking an event chip
                      ev.stopPropagation();
                      if (onEditEvent) {
                        ev.preventDefault();
                        onEditEvent(e);
                      }
                    }}
                  >
                    <Badge
                      color={e.type === 'LIVE' ? '#94c8ff' : '#beaaf2'}
                      text={
                        <Typography.Text style={{ fontSize: 12 }}>
                          {dayjs(e.startsAt).format('HH:mm')} {e.title}
                        </Typography.Text>
                      }
                    />
                  </List.Item>
                )}
              />
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
              {selected.endsAt
                ? ` — ${dayjs(selected.endsAt).format('HH:mm')}`
                : ''}
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
            <Typography.Title level={5} style={{ marginTop: 16 }}>
              Материалы
            </Typography.Title>
            <FileList
              ownerType="COURSE_EVENT_MATERIAL"
              ownerId={selected.id}
              canDelete={false}
            />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
