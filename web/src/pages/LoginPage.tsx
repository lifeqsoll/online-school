import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../shared/auth/AuthContext';

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
          Вход в панель администратора и куратора
        </Typography.Paragraph>
        <Form
          layout="vertical"
          onFinish={async (v) => {
            try {
              const user = await login(v.email, v.password);
              if (user.globalRole === 'ADMIN') nav('/admin');
              else nav('/curator');
            } catch (e) {
              message.error(e instanceof Error ? e.message : 'Ошибка входа');
            }
          }}
          initialValues={{
            email: 'admin@online-school.local',
            password: 'ChangeMeAdmin123!',
          }}
        >
          <Form.Item name="email" label="Email" rules={[{ required: true }]}>
            <Input type="email" />
          </Form.Item>
          <Form.Item name="password" label="Пароль" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Войти
          </Button>
        </Form>
      </Card>
    </div>
  );
}
