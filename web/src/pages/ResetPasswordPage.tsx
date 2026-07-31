import { Button, Form, Input, Typography, message } from 'antd';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, ApiError } from '../shared/api/client';
import { easeOutExpo } from '../shared/motion';

export function ResetPasswordPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const tokenFromUrl = params.get('token') ?? '';

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
            Новый пароль
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 28 }}>
            Придумайте пароль не короче 8 символов
          </Typography.Paragraph>

          <Form
            layout="vertical"
            requiredMark={false}
            initialValues={{ token: tokenFromUrl }}
            onFinish={async (v) => {
              try {
                await api('/auth/reset-password', {
                  method: 'POST',
                  json: { token: v.token, newPassword: v.newPassword },
                  auth: false,
                });
                message.success('Пароль обновлён — можно войти');
                nav('/login');
              } catch (e) {
                message.error(
                  e instanceof ApiError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : 'Не удалось сбросить пароль',
                );
              }
            }}
          >
            {!tokenFromUrl ? (
              <Form.Item
                name="token"
                label="Токен из письма"
                rules={[{ required: true, message: 'Вставьте токен' }]}
              >
                <Input size="large" placeholder="Токен сброса" />
              </Form.Item>
            ) : (
              <Form.Item name="token" hidden>
                <Input />
              </Form.Item>
            )}
            <Form.Item
              name="newPassword"
              label="Новый пароль"
              rules={[
                { required: true, message: 'Введите пароль' },
                { min: 8, message: 'Минимум 8 символов' },
              ]}
            >
              <Input.Password size="large" autoComplete="new-password" />
            </Form.Item>
            <Form.Item
              name="confirm"
              label="Повторите пароль"
              dependencies={['newPassword']}
              rules={[
                { required: true, message: 'Повторите пароль' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('newPassword') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Пароли не совпадают'));
                  },
                }),
              ]}
            >
              <Input.Password size="large" autoComplete="new-password" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large">
              Сохранить пароль
            </Button>
          </Form>

          <Typography.Paragraph
            type="secondary"
            style={{ marginTop: 24, marginBottom: 0, textAlign: 'center', fontSize: 13 }}
          >
            <Link to="/login" style={{ color: '#6b4fb8', fontWeight: 500 }}>
              Вернуться ко входу
            </Link>
          </Typography.Paragraph>
        </div>
      </motion.div>
    </div>
  );
}
