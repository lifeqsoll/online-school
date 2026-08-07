import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useCallback, useState } from 'react';
import { api } from '../../shared/api/client';
import {
  MonthGridCalendar,
  type CalEvent,
} from '../../features/schedule/WeekStripCalendar';

dayjs.extend(isoWeek);

function defaultMonthRange() {
  const from = dayjs().startOf('month').startOf('isoWeek').startOf('day');
  const to = dayjs().endOf('month').endOf('isoWeek').endOf('day');
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

export function LkCalendarPage() {
  const [range, setRange] = useState(defaultMonthRange);
  const onRangeChange = useCallback((next: { from: string; to: string }) => {
    setRange((prev) =>
      prev.from === next.from && prev.to === next.to ? prev : next,
    );
  }, []);

  const cal = useQuery({
    queryKey: ['me-calendar', 'month', range.from, range.to],
    queryFn: () =>
      api<CalEvent[]>(
        `/me/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
  });

  return (
    <div style={{ maxWidth: 1100 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Календарь
      </Typography.Title>
      <MonthGridCalendar
        events={Array.isArray(cal.data) ? cal.data : []}
        onRangeChange={onRangeChange}
      />
    </div>
  );
}
