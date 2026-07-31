import { Button, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../shared/auth/AuthContext';
import { api, ApiError } from '../../shared/api/client';
import { AuthModal } from '../auth/AuthModal';

type Props = {
  courseId: string;
  priceCents: number;
  enrolled?: boolean;
};

function formatPrice(cents: number) {
  if (cents <= 0) return null;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function EnrollBuyButton({ courseId, priceCents, enrolled }: Props) {
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      if (priceCents === 0) {
        await api(`/courses/${courseId}/enroll`, { method: 'POST' });
        message.success('Вы записаны на курс');
        await qc.invalidateQueries({ queryKey: ['me-enrollments'] });
        nav(`/lk/courses/${courseId}`);
        return;
      }

      const checkout = await api<{
        payment: { id: string };
        confirmationUrl: string;
      }>(`/courses/${courseId}/checkout`, { method: 'POST' });

      // Redirect to mock (or future real) payment page — same contract as YooKassa.
      window.location.assign(checkout.confirmationUrl);
    } catch (e) {
      message.error(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : 'Не удалось записаться',
      );
    } finally {
      setLoading(false);
    }
  };

  if (enrolled) {
    return (
      <Button type="primary" size="large" onClick={() => nav(`/lk/courses/${courseId}`)}>
        Перейти в кабинет
      </Button>
    );
  }

  const priceLabel = formatPrice(priceCents);

  return (
    <>
      <Button
        type="primary"
        size="large"
        loading={loading}
        onClick={async () => {
          if (!user) {
            setOpen(true);
            return;
          }
          await run();
        }}
      >
        {priceCents === 0
          ? 'Записаться бесплатно'
          : priceLabel
            ? `Купить · ${priceLabel}`
            : 'Купить'}
      </Button>
      <AuthModal
        open={open}
        onClose={() => setOpen(false)}
        defaultTab="register"
        title="Сначала войдите или зарегистрируйтесь"
        onSuccess={() => {
          void run();
        }}
      />
    </>
  );
}
