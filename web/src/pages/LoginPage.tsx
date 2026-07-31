import { Button, Form, Input, Tabs, Typography, message } from 'antd';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../shared/auth/AuthContext';
import { api, ApiError } from '../shared/api/client';
import { resolvePostLoginPath } from '../shared/auth/postLoginPath';
import { easeOutExpo } from '../shared/motion';

export function LoginPage() {
  const { user, loading, login, register } = useAuth();
  const nav = useNavigate();
  const [search] = useSearchParams();
  const defaultTab = search.get('tab') === 'register' ? 'register' : 'login';
  const next = search.get('next');
  const nextPath =
    next && next.startsWith('/') && !next.startsWith('//') ? next : null;

  if (!loading && user) {
    return <Navigate to={nextPath ?? '/lk'} replace />;
  }

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background:
          'radial-gradient(ellipse 80% 60% at 20% 10%, rgba(190,170,242,0.35), transparent),' +
          'radial-gradient(ellipse 70% 50% at 90% 80%, rgba(148,200,255,0.28), transparent),' +
          '#f7f5fb',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: easeOutExpo }}
        style={{ width: '100%', maxWidth: 420 }}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 20,
            padding: '36px 32px 28px',
            border: '1px solid rgba(190,170,242,0.25)',
            boxShadow: '0 24px 60px rgba(80, 60, 120, 0.08)',
          }}
        >
          <Typography.Text
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: '#6b4fb8',
              marginBottom: 8,
            }}
          >
            ОЛИМПИАДНАЯ ШКОЛА
          </Typography.Text>
          <Typography.Title level={2} style={{ margin: '0 0 6px', fontSize: 28 }}>
            {defaultTab === 'register' ? 'Регистрация' : 'Вход'}
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 20 }}>
            Ученики, кураторы и администраторы
          </Typography.Paragraph>

          <Tabs
            defaultActiveKey={defaultTab}
            items={[
              {
                key: 'login',
                label: 'Войти',
                children: (
                  <Form
                    layout="vertical"
                    requiredMark={false}
                    onFinish={async (v) => {
                      try {
                        const u = await login(v.email, v.password);
                        const path =
                          nextPath ?? (await resolvePostLoginPath(u, api));
                        message.success('Вход выполнен');
                        nav(path);
                      } catch (e) {
                        message.error(
                          e instanceof ApiError || e instanceof Error
                            ? e.message
                            : 'Не удалось войти',
                        );
                      }
                    }}
                  >
                    <Form.Item
                      name="email"
                      label="Email"
                      rules={[
                        { required: true, message: 'Введите email' },
                        { type: 'email', message: 'Некорректный email' },
                      ]}
                    >
                      <Input
                        size="large"
                        type="email"
                        placeholder="you@example.com"
                        autoComplete="email"
                      />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label="Пароль"
                      rules={[{ required: true, message: 'Введите пароль' }]}
                      style={{ marginBottom: 8 }}
                    >
                      <Input.Password
                        size="large"
                        placeholder="Ваш пароль"
                        autoComplete="current-password"
                      />
                    </Form.Item>
                    <div style={{ textAlign: 'right', marginBottom: 20 }}>
                      <Link
                        to="/forgot-password"
                        style={{ fontSize: 13, color: '#6b4fb8', fontWeight: 500 }}
                      >
                        Забыли пароль?
                      </Link>
                    </div>
                    <Button type="primary" htmlType="submit" block size="large">
                      Войти
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: 'Регистрация',
                children: (
                  <Form
                    layout="vertical"
                    requiredMark={false}
                    onFinish={async (v) => {
                      try {
                        const u = await register(v.email, v.password, v.firstName);
                        const path =
                          nextPath ?? (await resolvePostLoginPath(u, api));
                        message.success('Аккаунт создан');
                        nav(path);
                      } catch (e) {
                        message.error(
                          e instanceof ApiError || e instanceof Error
                            ? e.message
                            : 'Не удалось зарегистрироваться',
                        );
                      }
                    }}
                  >
                    <Form.Item name="firstName" label="Имя">
                      <Input size="large" placeholder="Как к вам обращаться" />
                    </Form.Item>
                    <Form.Item
                      name="email"
                      label="Email"
                      rules={[
                        { required: true, message: 'Введите email' },
                        { type: 'email', message: 'Некорректный email' },
                      ]}
                    >
                      <Input size="large" type="email" autoComplete="email" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label="Пароль"
                      rules={[
                        { required: true, message: 'Введите пароль' },
                        { min: 8, message: 'Минимум 8 символов' },
                      ]}
                    >
                      <Input.Password size="large" autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block size="large">
                      Создать аккаунт
                    </Button>
                  </Form>
                ),
              },
            ]}
          />

          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 24, marginBottom: 0, textAlign: 'center', fontSize: 13 }}
          >
            <Link to="/" style={{ color: 'inherit' }}>
              На главную
            </Link>
            <span style={{ margin: '0 8px', opacity: 0.4 }}>·</span>
            <Link to="/catalog" style={{ color: 'inherit' }}>
              Каталог
            </Link>
          </Typography.Paragraph>
        </div>
      </motion.div>
    </div>
  );
}
