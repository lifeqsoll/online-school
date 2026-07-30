import { Layout, Menu, Typography, Button, Space } from 'antd';
import {
  HomeOutlined,
  CalendarOutlined,
  BookOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

const { Header, Sider, Content } = Layout;
const KEY = 'os_lk_sidebar_open';

export function StudentShell() {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(() => localStorage.getItem(KEY) !== '0');

  useEffect(() => {
    localStorage.setItem(KEY, open ? '1' : '0');
  }, [open]);

  const managed = useQuery({
    queryKey: ['courses', 'managed'],
    queryFn: () => api<unknown[]>('/courses?managedOnly=true'),
    enabled: !!user && user.globalRole !== 'ADMIN',
  });

  const items = [
    { key: '/lk', icon: <HomeOutlined />, label: 'Главная' },
    { key: '/lk/calendar', icon: <CalendarOutlined />, label: 'Календарь' },
    { key: '/catalog', icon: <BookOutlined />, label: 'Каталог' },
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

  return (
    <Layout className="min-h-full">
      <Sider
        collapsible
        collapsed={!open}
        collapsedWidth={0}
        width={220}
        trigger={null}
        style={{
          background: '#fff',
          borderRight: open ? '1px solid var(--border)' : 'none',
          overflow: 'hidden',
        }}
      >
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <Typography.Text strong>Олимпиадная школа</Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selected]}
          items={items.map((i) => ({
            key: i.key,
            icon: i.icon,
            label: <Link to={i.key}>{i.label}</Link>,
          }))}
          style={{ borderInlineEnd: 0 }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingInline: 16,
          }}
        >
          <Space>
            <Button
              type="text"
              icon={open ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={() => setOpen((v) => !v)}
            />
            <Typography.Text type="secondary">Личный кабинет</Typography.Text>
          </Space>
          <Space>
            <Typography.Text>{user?.firstName || user?.email || user?.id}</Typography.Text>
            {staffPath ? (
              <Button type="link" onClick={() => nav(staffPath)}>
                Панель staff
              </Button>
            ) : null}
            <Button
              icon={<LogoutOutlined />}
              onClick={async () => {
                await logout();
                nav('/');
              }}
            >
              Выйти
            </Button>
          </Space>
        </Header>
        <Content style={{ padding: 24, background: 'var(--surface)' }}>
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              border: '1px solid var(--border)',
              padding: 20,
              minHeight: '70vh',
            }}
          >
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
