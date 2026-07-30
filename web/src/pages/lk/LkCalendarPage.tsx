import { useQuery } from '@tanstack/react-query';
import { Typography } from 'antd';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useMemo, useState } from 'react';
import { api } from '../../shared/api/client';
import { CalendarView, type CalEvent } from '../../features/schedule/CalendarView';

dayjs.extend(isoWeek);

export function LkCalendarPage() {
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const range = useMemo(() => {
    if (mode === 'week') {
      return {
        from: dayjs().startOf('isoWeek').toISOString(),
        to: dayjs().endOf('isoWeek').toISOString(),
      };
    }
    const start = dayjs().startOf('month').startOf('isoWeek');
    const end = dayjs().endOf('month').endOf('isoWeek');
    return { from: start.toISOString(), to: end.toISOString() };
  }, [mode]);

  const cal = useQuery({
    queryKey: ['me-calendar', range.from, range.to],
    queryFn: () =>
      api<CalEvent[]>(
        `/me/calendar?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
      ),
  });

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Календарь
      </Typography.Title>
      <CalendarView
        events={cal.data ?? []}
        mode={mode}
        onModeChange={setMode}
      />
    </div>
  );
}
