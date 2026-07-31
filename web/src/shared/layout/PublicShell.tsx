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
        transition={{ duration: 0.5, ease: easeOutExpo }}
      >
        <Header
          style={{
            background: 'rgba(255,255,255,0.82)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(190,170,242,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingInline: 24,
            position: 'sticky',
            top: 0,
            zIndex: 10,
            height: 64,
          }}
        >
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
            <Typography.Text
              strong
              style={{
                fontSize: 17,
                letterSpacing: '-0.02em',
                color: '#1a1528',
              }}
            >
              Олимпиадная школа
            </Typography.Text>
          </Link>
          <Space size="middle">
            <Button
              type="text"
              onClick={() => nav('/catalog')}
              style={{ fontWeight: 500 }}
            >
              Каталог
            </Button>
            {user ? (
              <>
                <Button type="primary" onClick={() => nav('/lk')} style={{ borderRadius: 10 }}>
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
              <Button
                type="primary"
                onClick={() => nav('/login')}
                style={{ borderRadius: 10, fontWeight: 600 }}
              >
                Войти
              </Button>
            )}
          </Space>
        </Header>
      </motion.div>
      <Content>
        <AnimatedOutlet />
      </Content>
      <Footer
        style={{
          textAlign: 'center',
          background: 'transparent',
          color: '#8c8798',
          padding: '28px 24px',
        }}
      >
        Олимпиадная школа
      </Footer>
    </Layout>
  );
}
