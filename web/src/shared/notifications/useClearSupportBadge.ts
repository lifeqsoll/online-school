import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { SupportBadgeChannel } from './supportChannels';

/** Clears support-tab badge when user opens the matching support page. */
export function useClearSupportBadge(channel?: SupportBadgeChannel) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    (async () => {
      try {
        await api('/me/notifications/read-support', {
          method: 'POST',
          json: { channel },
        });
        if (!cancelled) {
          await qc.invalidateQueries({ queryKey: ['notifications-unread'] });
          await qc.invalidateQueries({ queryKey: ['notifications-list'] });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channel, qc]);
}
