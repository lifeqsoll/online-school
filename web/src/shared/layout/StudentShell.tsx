import { Button, Space, Typography } from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  FormOutlined,
  LogoutOutlined,
  ReadOutlined,
  BookOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { AnimatedOutlet } from './AnimatedOutlet';
import { easeOutExpo } from '../motion';

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

  const items = [
    { key: '/lk', icon: <HomeOutlined />, title: 'Главная' },
    { key: '/lk/calendar', icon: <CalendarOutlined />, title: 'Календарь' },
    { key: '/lk/homework', icon: <FormOutlined />, title: 'Домашки' },
    { key: '/lk/knowledge', icon: <BookOutlined />, title: 'База знаний' },
    { key: '/lk/stats', icon: <BarChartOutlined />, title: 'Статистика' },
  ];

  const selected =
    [...items]
      .sort((a, b) => b.key.length - a.key.length)
      .find((i) => loc.pathname === i.key || loc.pathname.startsWith(i.key + '/'))
      ?.key ?? '/lk';

  const staffPath =
    user?.globalRole === 'ADMIN'
      ? '/admin'
      : (managed.data?.length ?? 0) > 0
        ? '/curator'
        : null;

  const totalXp = xp.data ?? 0;
  const barMax = Math.max(100, Math.ceil((totalXp + 1) / 100) * 100);
  const percent = Math.min(100, Math.round((totalXp / barMax) * 100));

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
                    }}
                  >
                    {i.icon}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: active ? 600 : 500,
                      color: active ? '#6b4fb8' : '#595959',
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
            <div
              title={`Опыт: ${totalXp} / ${barMax} XP`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: '#fff',
                border: '1px solid #ebebeb',
                borderRadius: 999,
                padding: '6px 12px 6px 10px',
                minWidth: 148,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: 'rgba(250, 173, 20, 0.14)',
                  color: '#d48806',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ReadOutlined />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8,
                    lineHeight: 1.1,
                  }}
                >
                  <Typography.Text strong style={{ fontSize: 14 }}>
                    {totalXp}
                    <Typography.Text
                      type="secondary"
                      style={{ fontSize: 11, fontWeight: 500, marginLeft: 4 }}
                    >
                      XP
                    </Typography.Text>
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {totalXp}/{barMax}
                  </Typography.Text>
                </div>
                <div
                  style={{
                    marginTop: 4,
                    height: 4,
                    borderRadius: 999,
                    background: '#f0f0f0',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${percent}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: 'linear-gradient(90deg, #95de64, #52c41a)',
                      transition: 'width 0.35s ease',
                    }}
                  />
                </div>
              </div>
            </div>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
              }}
            >
              {(user?.firstName || user?.email || 'Я')[0]?.toUpperCase()}
            </div>
            {staffPath ? (
              <Button
                type="primary"
                onClick={() =>
                  window.open(staffPath, '_blank', 'noopener,noreferrer')
                }
              >
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
