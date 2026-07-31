import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Avatar,
  Button,
  Form,
  Input,
  Space,
  Typography,
  Upload,
  message,
} from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { api, ApiError, getAccessToken } from '../../shared/api/client';
import { useAuth, type AuthUser } from '../../shared/auth/AuthContext';

export function LkProfilePage() {
  const { user, refreshMe } = useAuth();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [emailForm] = Form.useForm();
  const [codeForm] = Form.useForm();
  const [emailStep, setEmailStep] = useState<'idle' | 'code'>('idle');
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    form.setFieldsValue({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      nickname: user.nickname ?? '',
      bio: user.bio ?? '',
    });
    if (user.pendingEmail) setEmailStep('code');
  }, [user, form]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<AuthUser>('/users/me', { method: 'PATCH', json: body }),
    onSuccess: async () => {
      message.success('Профиль сохранён');
      await refreshMe();
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const removeAvatar = useMutation({
    mutationFn: () => api<AuthUser>('/users/me/avatar', { method: 'DELETE' }),
    onSuccess: async () => {
      message.success('Аватар удалён');
      await refreshMe();
    },
  });

  const requestEmail = useMutation({
    mutationFn: (newEmail: string) =>
      api<{ message: string; pendingEmail: string; code?: string }>(
        '/users/me/email/request',
        { method: 'POST', json: { newEmail } },
      ),
    onSuccess: async (res) => {
      message.success('Код отправлен на текущую почту');
      setEmailStep('code');
      setDevCode(res.code ?? null);
      await refreshMe();
    },
  });

  const confirmEmail = useMutation({
    mutationFn: (code: string) =>
      api<AuthUser>('/users/me/email/confirm', {
        method: 'POST',
        json: { code },
      }),
    onSuccess: async () => {
      message.success('Email обновлён');
      setEmailStep('idle');
      setDevCode(null);
      emailForm.resetFields();
      codeForm.resetFields();
      await refreshMe();
    },
  });

  const cancelEmail = useMutation({
    mutationFn: () =>
      api<AuthUser>('/users/me/email/cancel', { method: 'POST' }),
    onSuccess: async () => {
      message.info('Смена email отменена');
      setEmailStep('idle');
      setDevCode(null);
      emailForm.resetFields();
      codeForm.resetFields();
      await refreshMe();
    },
  });

  if (!user) return null;

  const initial =
    (user.nickname || user.firstName || user.email || '?')[0]?.toUpperCase() ??
    '?';

  return (
    <div
      style={{
        maxWidth: 560,
        margin: '0 auto',
        width: '100%',
        paddingBottom: 32,
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 8 }}>
          Профиль
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          Ник виден другим ученикам в рейтинге и поддержке
        </Typography.Paragraph>
      </div>

      <div
        style={{
          background: '#fff',
          border: '1px solid #ebebeb',
          borderRadius: 16,
          padding: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: 28,
            gap: 12,
          }}
        >
          <Avatar
            size={96}
            src={user.avatarUrl || undefined}
            icon={!user.avatarUrl ? <UserOutlined /> : undefined}
            style={{
              background: user.avatarUrl ? undefined : 'var(--accent)',
              fontSize: 36,
              fontWeight: 700,
            }}
          >
            {!user.avatarUrl ? initial : null}
          </Avatar>
          <Space wrap style={{ justifyContent: 'center' }}>
            <Upload
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              showUploadList={false}
              customRequest={async ({ file, onSuccess, onError }) => {
                try {
                  const fd = new FormData();
                  fd.append('file', file as File);
                  const token = getAccessToken();
                  const res = await fetch(
                    `${import.meta.env.VITE_API_URL ?? '/api'}/users/me/avatar`,
                    {
                      method: 'POST',
                      headers: token
                        ? { Authorization: `Bearer ${token}` }
                        : {},
                      body: fd,
                    },
                  );
                  if (!res.ok) {
                    const t = await res.text();
                    throw new Error(t || res.statusText);
                  }
                  message.success('Аватар обновлён');
                  await refreshMe();
                  onSuccess?.(await res.json());
                } catch (e) {
                  message.error(e instanceof Error ? e.message : 'Ошибка');
                  onError?.(e as Error);
                }
              }}
            >
              <Button>Загрузить фото</Button>
            </Upload>
            {user.avatarUrl ? (
              <Button
                danger
                loading={removeAvatar.isPending}
                onClick={() => removeAvatar.mutate()}
              >
                Удалить
              </Button>
            ) : null}
          </Space>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            PNG, JPEG или WebP до 20 МБ
          </Typography.Text>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            try {
              await save.mutateAsync({
                firstName: v.firstName || undefined,
                lastName: v.lastName || undefined,
                nickname: v.nickname ?? '',
                bio: v.bio ?? '',
              });
            } catch (e) {
              message.error(
                e instanceof ApiError || e instanceof Error
                  ? e.message
                  : 'Ошибка',
              );
            }
          }}
        >
          <Form.Item
            name="nickname"
            label="Ник"
            rules={[
              { min: 3, message: 'Минимум 3 символа' },
              { max: 24, message: 'Максимум 24 символа' },
              {
                pattern: /^[a-zA-Zа-яА-ЯёЁ0-9_]*$/,
                message: 'Только буквы, цифры и _',
              },
            ]}
            extra="Уникальный. Можно оставить пустым"
          >
            <Input placeholder="olymp_star" maxLength={24} />
          </Form.Item>
          <Form.Item name="firstName" label="Имя">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="lastName" label="Фамилия">
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="bio" label="О себе" extra="До 280 символов">
            <Input.TextArea rows={3} maxLength={280} showCount />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={save.isPending}>
            Сохранить профиль
          </Button>
        </Form>

        <div
          style={{
            marginTop: 28,
            paddingTop: 24,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Email
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
            Текущий: <Typography.Text strong>{user.email}</Typography.Text>
          </Typography.Paragraph>

          {emailStep === 'idle' ? (
            <Form
              form={emailForm}
              layout="vertical"
              onFinish={async (v) => {
                try {
                  await requestEmail.mutateAsync(v.newEmail);
                } catch (e) {
                  message.error(
                    e instanceof ApiError || e instanceof Error
                      ? e.message
                      : 'Ошибка',
                  );
                }
              }}
            >
              <Form.Item
                name="newEmail"
                label="Новый email"
                rules={[
                  { required: true, message: 'Введите email' },
                  { type: 'email', message: 'Некорректный email' },
                ]}
              >
                <Input type="email" placeholder="new@example.com" />
              </Form.Item>
              <Button
                htmlType="submit"
                block
                loading={requestEmail.isPending}
              >
                Отправить код на текущую почту
              </Button>
            </Form>
          ) : (
            <div>
              <Typography.Paragraph style={{ marginBottom: 12 }}>
                Код отправлен на текущую почту{' '}
                <Typography.Text strong>{user.email}</Typography.Text>
                . После подтверждения email станет{' '}
                <Typography.Text strong>
                  {user.pendingEmail || 'новый'}
                </Typography.Text>
                .
              </Typography.Paragraph>
              {devCode ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: 10,
                    borderRadius: 10,
                    background: 'rgba(190,170,242,0.12)',
                    fontSize: 13,
                  }}
                >
                  Dev-код: <Typography.Text code>{devCode}</Typography.Text>
                </div>
              ) : null}
              <Form
                form={codeForm}
                layout="vertical"
                onFinish={async (v) => {
                  try {
                    await confirmEmail.mutateAsync(v.code);
                  } catch (e) {
                    message.error(
                      e instanceof ApiError || e instanceof Error
                        ? e.message
                        : 'Ошибка',
                    );
                  }
                }}
              >
                <Form.Item
                  name="code"
                  label="Код из письма"
                  rules={[
                    { required: true, message: 'Введите код' },
                    { len: 6, message: '6 цифр' },
                  ]}
                >
                  <Input
                    placeholder="123456"
                    maxLength={6}
                    inputMode="numeric"
                  />
                </Form.Item>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    block
                    loading={confirmEmail.isPending}
                  >
                    Подтвердить смену email
                  </Button>
                  <Button
                    block
                    loading={cancelEmail.isPending}
                    onClick={() => cancelEmail.mutate()}
                  >
                    Отменить
                  </Button>
                </Space>
              </Form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
