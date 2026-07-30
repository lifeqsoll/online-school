import { Button, Card, Form, Input, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthContext';
import { api, ApiError } from '../shared/api/client';
import { resolvePostLoginPath } from '../shared/auth/postLoginPath';

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-full flex items-center justify-center bg-[var(--surface)] p-6">
      <Card style={{ width: 420, borderRadius: 8 }}>
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Олимпиадная школа
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Вход для учеников, кураторов и администраторов
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={async (v) => {
            try {
              const user = await login(v.email, v.password);
              const path = await resolvePostLoginPath(user, api);
              message.success(
                path === '/admin'
                  ? 'Вход выполнен: администратор'
                  : path === '/curator'
                    ? 'Вход выполнен: куратор'
                    : 'Вход выполнен',
              );
              nav(path);
            } catch (e) {
              if (e instanceof ApiError) {
                message.error(e.message);
              } else if (e instanceof Error) {
                message.error(e.message);
              } else {
                message.error('Не удалось войти');
              }
            }
          }}
        >
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, message: 'Введите email' }]}
          >
            <Input type="email" />
          </Form.Item>
          <Form.Item
            name="password"
            label="Пароль"
            rules={[{ required: true, message: 'Введите пароль' }]}
          >
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Войти
          </Button>
        </Form>
        <Typography.Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
          <Link to="/">На главную</Link>
          {' · '}
          <Link to="/catalog">Каталог</Link>
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
