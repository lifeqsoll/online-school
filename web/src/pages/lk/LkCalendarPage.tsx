import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import dayjs from 'dayjs';
import { api } from '../../shared/api/client';
import {
  WeekStripCalendar,
  type CalEvent,
} from '../../features/schedule/WeekStripCalendar';

export function LkCalendarPage() {
  const from = dayjs().startOf('day').subtract(0, 'day').toISOString();
  const to = dayjs().add(13, 'day').endOf('day').toISOString();

  const cal = useQuery({
    queryKey: ['me-calendar', from, to],
    queryFn: () =>
      api<CalEvent[]>(
        `/me/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });

  return (
    <div style={{ maxWidth: 1100 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Календарь
      </Typography.Title>
      <WeekStripCalendar events={cal.data ?? []} daysCount={7} />
    </div>
  );
}
