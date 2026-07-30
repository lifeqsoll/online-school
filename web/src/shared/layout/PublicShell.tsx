import { Button, Layout, Space, Typography } from 'antd';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const { Header, Content, Footer } = Layout;

export function PublicShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <Layout className="min-h-full" style={{ background: 'transparent' }}>
      <Header
        style={{
          background: 'rgba(255,255,255,0.92)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingInline: 24,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
          <Typography.Text strong style={{ fontSize: 18 }}>
            Олимпиадная школа
          </Typography.Text>
        </Link>
        <Space size="middle">
          <Button onClick={() => nav('/catalog')}>Каталог</Button>
          {user ? (
            <>
              <Button type="primary" onClick={() => nav('/lk')}>
                Кабинет
              </Button>
              <Button
                onClick={async () => {
                  await logout();
                  nav('/');
                }}
              >
                Выйти
              </Button>
            </>
          ) : (
            <Button type="primary" onClick={() => nav('/login')}>
              Войти
            </Button>
          )}
        </Space>
      </Header>
      <Content>
        <Outlet />
      </Content>
      <Footer style={{ textAlign: 'center', background: 'transparent' }}>
        Олимпиадная школа
      </Footer>
    </Layout>
  );
}
