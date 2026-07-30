import { Button, Layout, Space, Typography } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext';
import { AnimatedOutlet } from './AnimatedOutlet';
import { easeOutExpo } from '../motion';

const { Header, Content, Footer } = Layout;

export function PublicShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <Layout className="min-h-full" style={{ background: 'transparent' }}>
      <motion.div
        initial={{ y: -12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: easeOutExpo }}
      >
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
      </motion.div>
      <Content>
        <AnimatedOutlet />
      </Content>
      <Footer style={{ textAlign: 'center', background: 'transparent' }}>
        Олимпиадная школа
      </Footer>
    </Layout>
  );
}
