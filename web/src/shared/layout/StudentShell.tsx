import { Badge, Button, Space } from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  FormOutlined,
  LogoutOutlined,
  BookOutlined,
  BarChartOutlined,
  CustomerServiceOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { AnimatedOutlet } from './AnimatedOutlet';
import { easeOutExpo } from '../motion';
import { XpRankWidget } from '../xp/XpRankWidget';
import {
  NotificationsBell,
  useUnreadCounts,
} from '../notifications/NotificationsBell';

const COLLAPSED = 72;
const EXPANDED = 200;

export function StudentShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const managed = useQuery({
    queryKey: ['courses', 'managed'],
    queryFn: () => api<unknown[]>('/courses?managedOnly=true'),
    enabled: !!user && user.globalRole !== 'ADMIN',
  });

  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Array<{ courseId: string }>>('/me/enrollments'),
  });

  const courseIds = (enrollments.data ?? []).map((e) => e.courseId);
  const xp = useQuery({
    queryKey: ['xp-me-total', courseIds.join(',')],
    queryFn: async () => {
      const totals = await Promise.all(
        courseIds.map((id) =>
          api<{ totalXp: number }>(`/courses/${id}/xp/me`),
        ),
      );
      return totals.reduce((sum, row) => sum + (row.totalXp ?? 0), 0);
    },
    enabled: courseIds.length > 0,
  });

  const unread = useUnreadCounts();

  const items = [
    { key: '/lk', icon: <HomeOutlined />, title: 'Главная', badge: 0 },
    { key: '/lk/calendar', icon: <CalendarOutlined />, title: 'Календарь', badge: 0 },
    { key: '/lk/homework', icon: <FormOutlined />, title: 'Домашки', badge: 0 },
    { key: '/lk/knowledge', icon: <BookOutlined />, title: 'База знаний', badge: 0 },
    { key: '/lk/stats', icon: <BarChartOutlined />, title: 'Статистика', badge: 0 },
    { key: '/catalog', icon: <ShopOutlined />, title: 'Каталог', badge: 0 },
    {
      key: '/lk/support/tech',
      icon: <CustomerServiceOutlined />,
      title: 'Техподдержка',
      badge: unread.data?.supportTech ?? 0,
    },
  ];

  // Assignment detail lives under /lk/assignments/:id but belongs to Homework nav
  const selected = loc.pathname.startsWith('/lk/assignments')
    ? '/lk/homework'
    : ([...items]
        .sort((a, b) => b.key.length - a.key.length)
        .find((i) => {
          if (i.key === '/lk') return loc.pathname === '/lk';
          return (
            loc.pathname === i.key || loc.pathname.startsWith(i.key + '/')
          );
        })?.key ?? '/lk');

  const staffPath =
    user?.globalRole === 'ADMIN'
      ? '/admin'
      : (managed.data?.length ?? 0) > 0
        ? '/curator'
        : null;

  const totalXp = xp.data ?? 0;

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100%',
        background: '#f3f4f6',
        alignItems: 'stretch',
      }}
    >
      <motion.aside
        initial={false}
        animate={{ width: open ? EXPANDED : COLLAPSED }}
        transition={{ duration: 0.24, ease: easeOutExpo }}
        style={{
          background: '#fff',
          borderRight: '1px solid #ebebeb',
          paddingTop: 12,
          paddingBottom: 16,
          flexShrink: 0,
          overflow: 'hidden',
          position: 'sticky',
          top: 0,
          alignSelf: 'flex-start',
          height: '100vh',
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            height: 48,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 18,
            marginBottom: 8,
          }}
        >
          <button
            type="button"
            aria-label={open ? 'Свернуть меню' : 'Развернуть меню'}
            onClick={() => setOpen((v) => !v)}
            style={{
              width: 36,
              height: 36,
              border: 'none',
              borderRadius: 12,
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            О
          </button>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingInline: 14 }}>
          {items.map((i) => {
            const active = selected === i.key;
            return (
              <Link
                key={i.key}
                to={i.key}
                title={i.title}
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    height: 44,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    paddingLeft: 12,
                    background: active ? 'rgba(190, 170, 242, 0.35)' : 'transparent',
                    color: active ? '#6b4fb8' : '#8c8c8c',
                    fontSize: 18,
                    whiteSpace: 'nowrap',
                    transition: 'background 0.2s ease',
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      display: 'inline-flex',
                      justifyContent: 'center',
                      flexShrink: 0,
                      position: 'relative',
                    }}
                  >
                    <Badge
                      dot={i.badge > 0}
                      offset={[-2, 2]}
                      color="#6b4fb8"
                    >
                      {i.icon}
                    </Badge>
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                      color:
                        i.badge > 0 && !active
                          ? '#6b4fb8'
                          : active
                            ? '#6b4fb8'
                            : '#595959',
                      opacity: open ? 1 : 0,
                      transition: 'opacity 0.18s ease',
                      pointerEvents: 'none',
                    }}
                  >
                    {i.title}
                  </span>
                </div>
              </Link>
            );
          })}
        </nav>
      </motion.aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            background: 'transparent',
            padding: '0 24px',
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            height: 64,
            flexShrink: 0,
          }}
        >
          <Space size="middle" align="center">
            <NotificationsBell />
            <XpRankWidget totalXp={totalXp} />
            <button
              type="button"
              title="Профиль"
              onClick={() => nav('/lk/profile')}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border: 'none',
                padding: 0,
                background: user?.avatarUrl ? 'transparent' : 'var(--accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                cursor: 'pointer',
                overflow: 'hidden',
              }}
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                (user?.nickname || user?.firstName || user?.email || 'Я')[0]?.toUpperCase()
              )}
            </button>
            {staffPath ? (
              <Button type="primary" onClick={() => nav(staffPath)}>
                Staff
              </Button>
            ) : null}
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={async () => {
                await logout();
                nav('/');
              }}
            />
          </Space>
        </header>
        <main style={{ padding: '0 24px 24px', flex: 1 }}>
          <AnimatedOutlet />
        </main>
      </div>
    </div>
  );
}
