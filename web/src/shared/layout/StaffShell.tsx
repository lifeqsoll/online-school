import { Layout, Menu, Typography, Button, Tag, Space } from 'antd';
import {
  BookOutlined,
  DashboardOutlined,
  FormOutlined,
  TeamOutlined,
  BarChartOutlined,
  TrophyOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  CustomerServiceOutlined,
} from '@ant-design/icons';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthContext';
import { useEffect, useState, type ReactNode } from 'react';
import { AnimatedOutlet } from './AnimatedOutlet';

const { Header, Sider, Content } = Layout;

type Item = { key: string; icon: ReactNode; label: string };

const SIDEBAR_KEY = 'os_staff_sidebar_open';

export function StaffShell({
  base: _base,
  items,
  roleLabel,
}: {
  base: '/admin' | '/curator';
  items: Item[];
  roleLabel: string;
}) {
  const loc = useLocation();
  const nav = useNavigate();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_KEY);
    if (saved === '0') return false;
    if (saved === '1') return true;
    return typeof window !== 'undefined' ? window.innerWidth >= 992 : true;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, open ? '1' : '0');
  }, [open]);

  const selected =
    [...items]
      .sort((a, b) => b.key.length - a.key.length)
      .find((i) => loc.pathname === i.key || loc.pathname.startsWith(i.key + '/'))
      ?.key ?? items[0]?.key;

  return (
    <Layout className="min-h-full">
      <Sider
        collapsible
        collapsed={!open}
        collapsedWidth={0}
        width={240}
        trigger={null}
        onBreakpoint={(broken) => {
          if (broken) setOpen(false);
        }}
        breakpoint="lg"
        style={{
          background: '#fff',
          borderRight: open ? '1px solid var(--border)' : 'none',
          overflow: 'hidden',
        }}
        zeroWidthTriggerStyle={{ display: 'none' }}
      >
        <div className="px-4 py-4 border-b border-[var(--border)] whitespace-nowrap">
          <Typography.Text strong style={{ fontSize: 15 }}>
            Олимпиадная школа
          </Typography.Text>
          <div>
            <Tag color="purple" style={{ marginTop: 8 }}>
              {roleLabel}
            </Tag>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={selected ? [selected] : []}
          items={items.map((i) => ({
            key: i.key,
            icon: i.icon,
            label: <Link to={i.key}>{i.label}</Link>,
          }))}
          style={{ borderInlineEnd: 0 }}
          onClick={() => {
            if (window.innerWidth < 992) setOpen(false);
          }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingInline: 16,
          }}
        >
          <Space>
            <Button
              type="text"
              aria-label={open ? 'Скрыть меню' : 'Открыть меню'}
              icon={open ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              onClick={() => setOpen((v) => !v)}
            />
            <Typography.Text type="secondary">Панель управления</Typography.Text>
          </Space>
          <Space>
            <button
              type="button"
              onClick={() => nav('/lk/profile')}
              title="Профиль"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  background: 'var(--accent)',
                  color: '#fff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  (user?.nickname || user?.firstName || user?.email || '?')[0]?.toUpperCase()
                )}
              </span>
              <Typography.Text>
                {user?.nickname || user?.firstName || user?.email || user?.id}
              </Typography.Text>
            </button>
            <Button type="link" onClick={() => nav('/lk')}>
              Кабинет ученика
            </Button>
            <Button
              icon={<LogoutOutlined />}
              onClick={async () => {
                await logout();
                nav('/login');
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
            <AnimatedOutlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

export const adminMenu = (base: '/admin'): Item[] => [
  { key: `${base}`, icon: <DashboardOutlined />, label: 'Обзор' },
  { key: `${base}/courses`, icon: <BookOutlined />, label: 'Все курсы' },
  { key: `${base}/assignments`, icon: <FormOutlined />, label: 'Домашние задания' },
  { key: `${base}/students`, icon: <TeamOutlined />, label: 'Ученики' },
  { key: `${base}/analytics`, icon: <BarChartOutlined />, label: 'Аналитика' },
  { key: `${base}/xp`, icon: <TrophyOutlined />, label: 'XP / лидерборд' },
  {
    key: `${base}/support`,
    icon: <CustomerServiceOutlined />,
    label: 'Техподдержка',
  },
  { key: `${base}/users`, icon: <UserOutlined />, label: 'Пользователи' },
];

export const curatorMenu = (base: '/curator'): Item[] => [
  { key: `${base}`, icon: <DashboardOutlined />, label: 'Обзор' },
  { key: `${base}/courses`, icon: <BookOutlined />, label: 'Мои курсы' },
  { key: `${base}/assignments`, icon: <FormOutlined />, label: 'Домашние задания' },
  { key: `${base}/students`, icon: <TeamOutlined />, label: 'Ученики' },
  { key: `${base}/analytics`, icon: <BarChartOutlined />, label: 'Аналитика' },
  { key: `${base}/xp`, icon: <TrophyOutlined />, label: 'XP / лидерборд' },
  {
    key: `${base}/support`,
    icon: <CustomerServiceOutlined />,
    label: 'Поддержка курса',
  },
];
