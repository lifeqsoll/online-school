import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { api } from '../../shared/api/client';
import {
  MonthGridCalendar,
  type CalEvent,
} from '../../features/schedule/WeekStripCalendar';

dayjs.extend(isoWeek);

export function LkCalendarPage() {
  const from = dayjs().subtract(2, 'month').startOf('month').startOf('isoWeek').toISOString();
  const to = dayjs().add(2, 'month').endOf('month').endOf('isoWeek').toISOString();

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
      <MonthGridCalendar events={cal.data ?? []} />
    </div>
  );
}
