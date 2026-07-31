import { Button, Form, Input, Typography, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { api, ApiError } from '../shared/api/client';
import { easeOutExpo } from '../shared/motion';

type ForgotResult = {
  message: string;
  resetToken?: string;
};

export function ForgotPasswordPage() {
  const nav = useNavigate();
  const [devToken, setDevToken] = useState<string | null>(null);

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
            Сброс пароля
          </Typography.Title>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 28 }}>
            Укажите email — если аккаунт есть, отправим инструкцию
          </Typography.Paragraph>

          <Form
            layout="vertical"
            requiredMark={false}
            onFinish={async (v) => {
              try {
                const res = await api<ForgotResult>('/auth/forgot-password', {
                  method: 'POST',
                  json: { email: v.email },
                  auth: false,
                });
                message.success(
                  'Если такой email есть в системе, инструкция отправлена',
                );
                if (res.resetToken) {
                  setDevToken(res.resetToken);
                }
              } catch (e) {
                message.error(
                  e instanceof ApiError
                    ? e.message
                    : e instanceof Error
                      ? e.message
                      : 'Не удалось отправить запрос',
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
              <Input size="large" type="email" placeholder="you@example.com" autoComplete="email" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block size="large">
              Отправить
            </Button>
          </Form>

          {devToken ? (
            <div
              style={{
                marginTop: 20,
                padding: 14,
                borderRadius: 12,
                background: 'rgba(190,170,242,0.12)',
                border: '1px solid rgba(190,170,242,0.35)',
              }}
            >
              <Typography.Text style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                Dev-режим: токен сброса (в проде его не будет)
              </Typography.Text>
              <Button
                type="link"
                style={{ padding: 0, height: 'auto' }}
                onClick={() =>
                  nav(`/reset-password?token=${encodeURIComponent(devToken)}`)
                }
              >
                Перейти к установке нового пароля →
              </Button>
            </div>
          ) : null}

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
