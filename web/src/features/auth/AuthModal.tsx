import { Button, Form, Input, Modal, Tabs, message } from 'antd';
import { useAuth } from '../../shared/auth/AuthContext';
import { ApiError } from '../../shared/api/client';

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export function AuthModal({ open, onClose, onSuccess }: Props) {
  const { login, register } = useAuth();

  return (
    <Modal open={open} onCancel={onClose} footer={null} destroyOnClose title="Вход">
      <Tabs
        items={[
          {
            key: 'login',
            label: 'Войти',
            children: (
              <Form
                layout="vertical"
                onFinish={async (v) => {
                  try {
                    await login(v.email, v.password);
                    message.success('Вы вошли');
                    onClose();
                    onSuccess();
                  } catch (e) {
                    message.error(
                      e instanceof ApiError || e instanceof Error
                        ? e.message
                        : 'Ошибка входа',
                    );
                  }
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
            ),
          },
          {
            key: 'register',
            label: 'Регистрация',
            children: (
              <Form
                layout="vertical"
                onFinish={async (v) => {
                  try {
                    await register(v.email, v.password, v.firstName);
                    message.success('Аккаунт создан');
                    onClose();
                    onSuccess();
                  } catch (e) {
                    message.error(
                      e instanceof ApiError || e instanceof Error
                        ? e.message
                        : 'Ошибка регистрации',
                    );
                  }
                }}
              >
                <Form.Item name="firstName" label="Имя">
                  <Input />
                </Form.Item>
                <Form.Item name="email" label="Email" rules={[{ required: true }]}>
                  <Input type="email" />
                </Form.Item>
                <Form.Item
                  name="password"
                  label="Пароль"
                  rules={[{ required: true, min: 8, message: 'Минимум 8 символов' }]}
                >
                  <Input.Password />
                </Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Создать аккаунт
                </Button>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  );
}
