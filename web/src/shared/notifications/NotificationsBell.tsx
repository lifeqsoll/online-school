import { BellOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Drawer, Empty, Typography } from 'antd';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { easeOutExpo } from '../motion';

export type AppNotification = {
  id: string;
  kind: string;
  channel: 'TOAST' | 'INBOX';
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  courseId?: string | null;
  readAt?: string | null;
  createdAt: string;
  course?: { id: string; title: string } | null;
};

export type UnreadCounts = {
  toast: number;
  inbox: number;
  total: number;
  supportTech: number;
  supportCourse: number;
  staffTech: number;
  staffCourse: number;
};

const SHOWN_TOASTS_KEY = 'os_shown_toast_ids';

function loadShownToastIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHOWN_TOASTS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistShownToastIds(ids: Set<string>) {
  const arr = [...ids].slice(-80);
  sessionStorage.setItem(SHOWN_TOASTS_KEY, JSON.stringify(arr));
}

function kindLabel(kind: string) {
  switch (kind) {
    case 'RANK_UP':
      return 'Ранг';
    case 'LESSON_OPENED':
      return 'Урок';
    case 'HW_GRADED':
      return 'ДЗ';
    case 'HW_SUBMITTED':
      return 'Проверка';
    case 'REVIEW_REQUEST':
      return 'Отзыв';
    case 'REVIEW_PENDING':
      return 'Модерация';
    case 'REMINDER':
      return 'Напоминание';
    case 'SUPPORT_REPLY':
      return 'Поддержка';
    default:
      return 'Уведомление';
  }
}

export function useUnreadCounts(enabled = true) {
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api<UnreadCounts>('/me/notifications/unread-count'),
    refetchInterval: 12_000,
    enabled,
  });
}

export function NotificationsBell() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const shownRef = useRef<Set<string>>(loadShownToastIds());

  const managed = useQuery({
    queryKey: ['courses', 'managed'],
    queryFn: () => api<unknown[]>('/courses?managedOnly=true'),
    enabled: !!user && user.globalRole !== 'ADMIN',
  });

  const canOpenAdmin = user?.globalRole === 'ADMIN';
  const canOpenSupport =
    user?.globalRole === 'ADMIN' || user?.globalRole === 'SUPPORT';
  const canOpenCurator =
    user?.globalRole === 'ADMIN' || (managed.data?.length ?? 0) > 0;

  const resolveLink = (linkUrl?: string | null) => {
    if (!linkUrl) return null;
    if (linkUrl.startsWith('/admin') && !canOpenAdmin) {
      if (canOpenSupport && linkUrl.includes('support')) {
        return '/support/inbox';
      }
      return '/lk/support/tech';
    }
    if (linkUrl.startsWith('/support') && !canOpenSupport) {
      return '/lk/support/tech';
    }
    if (linkUrl.startsWith('/curator') && !canOpenCurator) {
      return '/lk';
    }
    if (linkUrl.includes('/lk/support/course')) {
      // Course support lives inside the course now
      return linkUrl.includes('tab=curator') ? linkUrl : '/lk';
    }
    return linkUrl;
  };

  const counts = useUnreadCounts();

  const list = useQuery({
    queryKey: ['notifications-list'],
    queryFn: () => api<AppNotification[]>('/me/notifications'),
    refetchInterval: 12_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) =>
      api(`/me/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications-unread'] });
      await qc.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api('/me/notifications/read-all', { method: 'POST' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications-unread'] });
      await qc.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  // Keep all notifications for a week (API already filters); show both channels
  const drawerItems = useMemo(() => list.data ?? [], [list.data]);

  const unreadTotal = counts.data?.total ?? 0;
  const unreadAny = drawerItems.some((n) => !n.readAt);

  useEffect(() => {
    const unreadToasts = (list.data ?? []).filter((n) => {
      if (n.channel !== 'TOAST' || n.readAt) return false;
      // Hide staff routes from users who cannot open them
      if (n.linkUrl?.startsWith('/admin') && !canOpenAdmin) {
        if (!(canOpenSupport && n.linkUrl.includes('support'))) return false;
      }
      if (n.linkUrl?.startsWith('/support') && !canOpenSupport) return false;
      if (n.linkUrl?.startsWith('/curator') && !canOpenCurator) return false;
      return true;
    });
    if (!unreadToasts.length) return;

    const fresh = unreadToasts.filter((n) => !shownRef.current.has(n.id));
    if (!fresh.length) return;

    for (const n of fresh) {
      shownRef.current.add(n.id);
    }
    persistShownToastIds(shownRef.current);

    setToasts((prev) => {
      const ids = new Set(prev.map((t) => t.id));
      const next = [...prev];
      for (const n of fresh) {
        if (!ids.has(n.id)) next.push(n);
      }
      return next.slice(-5);
    });

    for (const n of fresh) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== n.id));
      }, 7000);
      // Keep staff action toasts unread until opened (support + HW review)
      if (n.kind !== 'SUPPORT_REPLY' && n.kind !== 'HW_SUBMITTED' && n.kind !== 'REVIEW_PENDING' && n.kind !== 'REVIEW_REQUEST') {
        void markRead.mutateAsync(n.id).catch(() => undefined);
      }
    }
    // Re-run when staff access flags resolve (managed courses load)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, canOpenAdmin, canOpenCurator, canOpenSupport]);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const openItem = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate(n.id);
    setOpen(false);
    dismissToast(n.id);
    const target = resolveLink(n.linkUrl);
    if (target) nav(target);
  };

  return (
    <>
      <Badge count={unreadTotal} size="small" offset={[-2, 2]}>
        <button
          type="button"
          aria-label="Уведомления"
          onClick={() => setOpen(true)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            border: '1px solid #ebebeb',
            background: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: unreadTotal > 0 ? '#6b4fb8' : '#8c8c8c',
            fontSize: 18,
          }}
        >
          <BellOutlined />
        </button>
      </Badge>

      <Drawer
        title="Уведомления"
        open={open}
        onClose={() => setOpen(false)}
        width={380}
        styles={{
          body: { borderRadius: '20px 0 0 20px' },
          content: { borderRadius: '20px 0 0 20px', overflow: 'hidden' },
          header: { borderRadius: '20px 0 0 0' },
        }}
        style={{ borderRadius: '20px 0 0 20px' }}
        extra={
          unreadAny ? (
            <Button type="link" size="small" onClick={() => markAll.mutate()}>
              Прочитать все
            </Button>
          ) : null
        }
      >
        <Typography.Paragraph type="secondary" style={{ marginTop: 0, fontSize: 12 }}>
          Хранятся 7 дней, даже после просмотра
        </Typography.Paragraph>
        {drawerItems.length === 0 ? (
          <Empty description="Пока пусто" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {drawerItems.map((n, index) => {
              const unread = !n.readAt;
              const stackOffset = Math.min(index, 8);
              return (
                <motion.button
                  key={n.id}
                  type="button"
                  onClick={() => openItem(n)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: easeOutExpo }}
                  style={{
                    textAlign: 'left',
                    border: unread ? '1px solid #d3c4f5' : '1px solid #f0f0f0',
                    background: unread ? 'rgba(190,170,242,0.16)' : '#fafafa',
                    borderRadius: 20,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    font: 'inherit',
                    boxShadow: unread
                      ? `0 ${4 + stackOffset}px ${14 + stackOffset * 2}px rgba(107,79,184,0.14)`
                      : '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 11, textTransform: 'uppercase' }}
                    >
                      {kindLabel(n.kind)}
                      {n.course?.title ? ` · ${n.course.title}` : ''}
                    </Typography.Text>
                    {unread ? (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: '#6b4fb8',
                          flexShrink: 0,
                          marginTop: 4,
                        }}
                      />
                    ) : null}
                  </div>
                  <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>
                    {n.title}
                  </Typography.Text>
                  {n.body ? (
                    <Typography.Paragraph
                      type="secondary"
                      style={{ margin: '4px 0 0', fontSize: 13 }}
                      ellipsis={{ rows: 2 }}
                    >
                      {n.body}
                    </Typography.Paragraph>
                  ) : null}
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(n.createdAt).toLocaleString('ru-RU')}
                  </Typography.Text>
                </motion.button>
              );
            })}
          </div>
        )}
      </Drawer>

      <div
        style={{
          position: 'fixed',
          right: 20,
          bottom: 20,
          zIndex: 1200,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 10,
          width: 320,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {toasts.map((t, i) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ duration: 0.28, ease: easeOutExpo }}
              style={{
                pointerEvents: 'auto',
                background: '#fff',
                borderRadius: 22,
                border: '1px solid #ebebeb',
                boxShadow: `0 ${10 + i * 2}px ${32 + i * 4}px rgba(0,0,0,0.14)`,
                padding: '14px 16px',
                cursor: 'pointer',
                overflow: 'hidden',
              }}
              onClick={() => openItem(t)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <Typography.Text
                  style={{
                    fontSize: 11,
                    color: '#6b4fb8',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {kindLabel(t.kind)}
                </Typography.Text>
                <button
                  type="button"
                  aria-label="Закрыть"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissToast(t.id);
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#bfbfbf',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
              <Typography.Text strong style={{ display: 'block', fontSize: 14 }}>
                {t.title}
              </Typography.Text>
              {t.body ? (
                <Typography.Paragraph
                  style={{ margin: '4px 0 0', fontSize: 13, color: '#595959' }}
                  ellipsis={{ rows: 3 }}
                >
                  {t.body}
                </Typography.Paragraph>
              ) : null}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
