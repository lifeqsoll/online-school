import { Layout, Button, Space, Typography, Progress } from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  FormOutlined,
  LogoutOutlined,
  ReadOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

const { Header, Sider, Content } = Layout;

export function StudentShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();

  const managed = useQuery({
    queryKey: ['courses', 'managed'],
    queryFn: () => api<unknown[]>('/courses?managedOnly=true'),
    enabled: !!user && user.globalRole !== 'ADMIN',
  });

  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Array<{ courseId: string }>>('/me/enrollments'),
  });

  const firstCourseId = enrollments.data?.[0]?.courseId;
  const xp = useQuery({
    queryKey: ['xp-me', firstCourseId],
    queryFn: () =>
      api<{ totalXp: number }>(`/xp/me?courseId=${firstCourseId}`),
    enabled: !!firstCourseId,
  });

  const items = [
    { key: '/lk', icon: <HomeOutlined />, title: 'Главная' },
    { key: '/lk/calendar', icon: <CalendarOutlined />, title: 'Календарь' },
    { key: '/lk/homework', icon: <FormOutlined />, title: 'Домашки' },
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

  const totalXp = xp.data?.totalXp ?? 0;
  const barMax = Math.max(100, Math.ceil((totalXp + 1) / 100) * 100);

  return (
    <Layout style={{ minHeight: '100%', background: '#f3f4f6', alignItems: 'stretch' }}>
      <Sider
        width={72}
        style={{
          background: '#fff',
          borderRight: '1px solid #ebebeb',
          paddingTop: 12,
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div
            style={{
              width: 36,
              height: 36,
              margin: '0 auto',
              borderRadius: 12,
              background: 'var(--accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
            }}
          >
            О
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          {items.map((i) => {
            const active = selected === i.key;
            return (
              <Link
                key={i.key}
                to={i.key}
                title={i.title}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? '#6b4fb8' : '#8c8c8c',
                  fontSize: 18,
                }}
              >
                {i.icon}
              </Link>
            );
          })}
        </div>
      </Sider>
      <Layout style={{ background: 'transparent' }}>
        <Header
          style={{
            background: 'transparent',
            paddingInline: 24,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            height: 64,
          }}
        >
          <Space size="middle">
            <Space size={6}>
              <ReadOutlined style={{ color: '#faad14' }} />
              <Typography.Text>{totalXp}</Typography.Text>
            </Space>
            <div style={{ width: 120 }}>
              <Progress
                percent={Math.min(100, Math.round((totalXp / barMax) * 100))}
                size="small"
                showInfo={false}
                strokeColor="#73d13d"
              />
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {totalXp} / {barMax}
              </Typography.Text>
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
                onClick={() => window.open(staffPath, '_blank', 'noopener,noreferrer')}
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
        </Header>
        <Content style={{ padding: '0 24px 24px', height: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
