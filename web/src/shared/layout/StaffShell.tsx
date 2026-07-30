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
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthContext';
import type { ReactNode } from 'react';

const { Header, Sider, Content } = Layout;

type Item = { key: string; icon: ReactNode; label: string };

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
  const selected =
    items.find((i) => loc.pathname === i.key || loc.pathname.startsWith(i.key + '/'))
      ?.key ?? items[0]?.key;

  return (
    <Layout className="min-h-full">
      <Sider
        breakpoint="lg"
        collapsedWidth={64}
        width={240}
        style={{ background: '#fff', borderRight: '1px solid var(--border)' }}
      >
        <div className="px-4 py-4 border-b border-[var(--border)]">
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
            paddingInline: 20,
          }}
        >
          <Typography.Text type="secondary">Панель управления</Typography.Text>
          <Space>
            <Typography.Text>
              {user?.firstName || user?.email || user?.id}
            </Typography.Text>
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
            <Outlet />
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
  { key: `${base}/users`, icon: <UserOutlined />, label: 'Пользователи' },
];

export const curatorMenu = (base: '/curator'): Item[] => [
  { key: `${base}`, icon: <DashboardOutlined />, label: 'Обзор' },
  { key: `${base}/courses`, icon: <BookOutlined />, label: 'Мои курсы' },
  { key: `${base}/assignments`, icon: <FormOutlined />, label: 'Домашние задания' },
  { key: `${base}/students`, icon: <TeamOutlined />, label: 'Ученики' },
  { key: `${base}/analytics`, icon: <BarChartOutlined />, label: 'Аналитика' },
  { key: `${base}/xp`, icon: <TrophyOutlined />, label: 'XP / лидерборд' },
];
