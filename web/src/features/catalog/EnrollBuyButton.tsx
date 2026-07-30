import { Button, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthContext';
import { api, ApiError } from '../../shared/api/client';
import { AuthModal } from '../auth/AuthModal';

type Props = {
  courseId: string;
  priceCents: number;
  enrolled?: boolean;
};

export function EnrollBuyButton({ courseId, priceCents, enrolled }: Props) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      if (priceCents === 0) {
        await api(`/courses/${courseId}/enroll`, { method: 'POST' });
      } else {
        const checkout = await api<{ payment: { id: string } }>(
          `/courses/${courseId}/checkout`,
          { method: 'POST' },
        );
        await api('/payments/mock/confirm', {
          method: 'POST',
          json: { paymentId: checkout.payment.id },
        });
      }
      message.success('Вы записаны на курс');
      nav(`/lk/courses/${courseId}`);
    } catch (e) {
      message.error(
        e instanceof ApiError || e instanceof Error ? e.message : 'Не удалось записаться',
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
        {priceCents === 0 ? 'Записаться бесплатно' : 'Купить'}
      </Button>
      <AuthModal
        open={open}
        onClose={() => setOpen(false)}
        onSuccess={() => {
          void run();
        }}
      />
    </>
  );
}
