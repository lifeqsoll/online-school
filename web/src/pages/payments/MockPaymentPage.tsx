import { Button, Form, Input, Spin, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../shared/auth/AuthContext';
import { api, ApiError } from '../../shared/api/client';

type PaymentView = {
  id: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'REFUNDED';
  amountCents: number;
  currency: string;
  courseId: string;
  course: { id: string; title: string; slug?: string | null };
};

type PayMethod = 'mir_pay' | 'sbp' | 't_pay' | 'card';

const METHODS: Array<{
  id: PayMethod;
  title: string;
  hint: string;
  accent: string;
  mark: ReactNode;
}> = [
  {
    id: 'mir_pay',
    title: 'Мир Pay',
    hint: 'Оплата в приложении банка',
    accent: '#0b6e4f',
    mark: (
      <span style={{ fontWeight: 800, letterSpacing: '-0.02em', color: '#0b6e4f' }}>
        МИР
      </span>
    ),
  },
  {
    id: 'sbp',
    title: 'СБП',
    hint: 'Система быстрых платежей',
    accent: '#1a56db',
    mark: (
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: 'linear-gradient(135deg,#1a56db,#7c3aed)',
          color: '#fff',
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        СБП
      </span>
    ),
  },
  {
    id: 't_pay',
    title: 'Т-Pay',
    hint: 'Т-Банк / T‑Pay',
    accent: '#ffdd2d',
    mark: (
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: '#111',
          color: '#ffdd2d',
          display: 'grid',
          placeItems: 'center',
          fontWeight: 900,
          fontSize: 16,
        }}
      >
        Т
      </span>
    ),
  },
  {
    id: 'card',
    title: 'Карта',
    hint: 'Мир · Visa · Mastercard',
    accent: '#334155',
    mark: (
      <span
        style={{
          width: 28,
          height: 20,
          borderRadius: 4,
          border: '2px solid #334155',
          display: 'block',
          position: 'relative',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 3,
            top: 4,
            width: 8,
            height: 6,
            borderRadius: 1,
            background: '#334155',
          }}
        />
      </span>
    ),
  },
];

function formatMoney(cents: number, currency: string) {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency || 'RUB',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function onlyDigits(v: string) {
  return v.replace(/\D/g, '');
}

function formatCardNumber(raw: string) {
  const d = onlyDigits(raw).slice(0, 19);
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatExpiry(raw: string) {
  const d = onlyDigits(raw).slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

function luhnOk(num: string) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i -= 1) {
    let n = Number(num[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return num.length >= 13 && sum % 10 === 0;
}

export function MockPaymentPage() {
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const paymentId = params.get('paymentId') ?? '';
  const returnUrl = params.get('returnUrl') || '/catalog';
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'pay' | 'fail' | 'cancel' | null>(null);
  const [method, setMethod] = useState<PayMethod>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [holder, setHolder] = useState('');

  const payment = useQuery({
    queryKey: ['payment', paymentId],
    queryFn: () => api<PaymentView>(`/payments/${paymentId}`),
    enabled: !!user && !!paymentId,
  });

  const safeReturn = useMemo(() => {
    try {
      if (returnUrl.startsWith('/')) return returnUrl;
      const u = new URL(returnUrl, window.location.origin);
      if (u.origin === window.location.origin) {
        return `${u.pathname}${u.search}${u.hash}`;
      }
    } catch {
      /* ignore */
    }
    return '/catalog';
  }, [returnUrl]);

  const afterSuccess = async (courseId: string) => {
    await qc.invalidateQueries({ queryKey: ['me-enrollments'] });
    message.success('Оплата прошла — вы записаны на курс');
    nav(`/lk/courses/${courseId}`, { replace: true });
  };

  const confirm = useMutation({
    mutationFn: () =>
      api<{
        payment: { id: string; courseId: string; status: string };
        enrollment?: { courseId: string } | null;
      }>('/payments/mock/confirm', {
        method: 'POST',
        json: { paymentId },
      }),
    onSuccess: async (res) => {
      await afterSuccess(res.enrollment?.courseId ?? res.payment.courseId);
    },
    onError: (e: Error) =>
      message.error(e instanceof ApiError ? e.message : e.message),
  });

  const fail = useMutation({
    mutationFn: () =>
      api('/payments/mock/fail', {
        method: 'POST',
        json: { paymentId },
      }),
    onSuccess: async () => {
      message.warning('Оплата отклонена (эмуляция)');
      await payment.refetch();
    },
    onError: (e: Error) =>
      message.error(e instanceof ApiError ? e.message : e.message),
  });

  const cancel = useMutation({
    mutationFn: () =>
      api('/payments/mock/cancel', {
        method: 'POST',
        json: { paymentId },
      }),
    onSuccess: () => {
      message.info('Оплата отменена');
      nav(safeReturn, { replace: true });
    },
    onError: (e: Error) =>
      message.error(e instanceof ApiError ? e.message : e.message),
  });

  const validateBeforePay = (): boolean => {
    if (method !== 'card') return true;
    const num = onlyDigits(cardNumber);
    const exp = onlyDigits(expiry);
    const cv = onlyDigits(cvc);
    if (!luhnOk(num)) {
      message.error('Проверьте номер карты (для теста: 4242 4242 4242 4242)');
      return false;
    }
    if (exp.length !== 4) {
      message.error('Укажите срок MM/YY');
      return false;
    }
    const mm = Number(exp.slice(0, 2));
    if (mm < 1 || mm > 12) {
      message.error('Некорректный месяц на карте');
      return false;
    }
    if (cv.length < 3) {
      message.error('Укажите CVC');
      return false;
    }
    if (!holder.trim()) {
      message.error('Укажите имя держателя');
      return false;
    }
    return true;
  };

  const runPay = async () => {
    if (!validateBeforePay()) return;
    setBusy('pay');
    try {
      // Simulated processing delay so wallet/card UX feels real
      await new Promise((r) => setTimeout(r, method === 'card' ? 700 : 1100));
      await confirm.mutateAsync();
    } finally {
      setBusy(null);
    }
  };

  if (authLoading) return <Spin fullscreen />;
  if (!user) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(`/payments/mock?paymentId=${paymentId}&returnUrl=${encodeURIComponent(returnUrl)}`)}`}
        replace
      />
    );
  }
  if (!paymentId) {
    return (
      <div style={page}>
        <div style={panel}>
          <Typography.Title level={3}>Нет paymentId</Typography.Title>
          <Link to="/catalog">В каталог</Link>
        </div>
      </div>
    );
  }
  if (payment.isLoading) return <Spin fullscreen />;
  if (payment.isError || !payment.data) {
    return (
      <div style={page}>
        <div style={panel}>
          <Typography.Title level={3}>Платёж не найден</Typography.Title>
          <Typography.Paragraph type="secondary">
            {payment.error instanceof Error
              ? payment.error.message
              : 'Не удалось загрузить оплату'}
          </Typography.Paragraph>
          <Link to="/catalog">В каталог</Link>
        </div>
      </div>
    );
  }

  const p = payment.data;
  const done = p.status === 'SUCCEEDED';
  const blocked = p.status === 'FAILED' || p.status === 'CANCELED';
  const selected = METHODS.find((m) => m.id === method)!;
  const amountLabel = formatMoney(p.amountCents, p.currency);

  return (
    <div style={page}>
      <div style={panel}>
        <div style={badge}>Эмуляция оплаты · mock UI</div>
        <Typography.Title level={2} style={{ marginTop: 12, marginBottom: 4 }}>
          Оплата
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 18 }}>
          {p.course.title}
        </Typography.Paragraph>

        <div style={{ ...row, marginBottom: 20 }}>
          <span style={label}>К оплате</span>
          <strong style={{ fontSize: 26, letterSpacing: '-0.02em' }}>
            {amountLabel}
          </strong>
        </div>

        {done || blocked ? null : (
          <>
            <Typography.Text strong style={{ display: 'block', marginBottom: 10 }}>
              Способ оплаты
            </Typography.Text>
            <div style={methodGrid}>
              {METHODS.map((m) => {
                const active = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    style={{
                      ...methodBtn,
                      borderColor: active ? m.accent : '#e5e7eb',
                      background: active ? '#f8fafc' : '#fff',
                      boxShadow: active
                        ? `0 0 0 2px ${m.accent}22`
                        : 'none',
                    }}
                  >
                    <span style={methodMark}>{m.mark}</span>
                    <span style={{ textAlign: 'left' }}>
                      <span style={{ display: 'block', fontWeight: 650 }}>
                        {m.title}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontSize: 11,
                          color: '#94a3b8',
                          marginTop: 2,
                        }}
                      >
                        {m.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {method === 'card' ? (
              <div style={{ marginTop: 18 }}>
                <div style={liveCard}>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 18 }}>
                    Bank card · mock
                  </div>
                  <div
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 18,
                      letterSpacing: 2,
                      minHeight: 28,
                    }}
                  >
                    {cardNumber || '•••• •••• •••• ••••'}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 18,
                      fontSize: 12,
                      opacity: 0.9,
                    }}
                  >
                    <span>{holder.trim() || 'ИМЯ НА КАРТЕ'}</span>
                    <span>{expiry || 'MM/YY'}</span>
                  </div>
                </div>

                <Form layout="vertical" requiredMark={false} style={{ marginTop: 4 }}>
                  <Form.Item label="Номер карты" style={{ marginBottom: 12 }}>
                    <Input
                      size="large"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="4242 4242 4242 4242"
                      value={cardNumber}
                      onChange={(e) =>
                        setCardNumber(formatCardNumber(e.target.value))
                      }
                    />
                  </Form.Item>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                    }}
                  >
                    <Form.Item label="Срок" style={{ marginBottom: 12 }}>
                      <Input
                        size="large"
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        placeholder="12/30"
                        value={expiry}
                        onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      />
                    </Form.Item>
                    <Form.Item label="CVC" style={{ marginBottom: 12 }}>
                      <Input
                        size="large"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        placeholder="123"
                        maxLength={4}
                        value={cvc}
                        onChange={(e) =>
                          setCvc(onlyDigits(e.target.value).slice(0, 4))
                        }
                      />
                    </Form.Item>
                  </div>
                  <Form.Item label="Имя на карте" style={{ marginBottom: 8 }}>
                    <Input
                      size="large"
                      autoComplete="cc-name"
                      placeholder="IVAN IVANOV"
                      value={holder}
                      onChange={(e) =>
                        setHolder(e.target.value.toUpperCase().slice(0, 40))
                      }
                    />
                  </Form.Item>
                </Form>
                <Typography.Paragraph
                  type="secondary"
                  style={{ fontSize: 12, marginBottom: 0 }}
                >
                  Тестовая карта: <code>4242 4242 4242 4242</code>, любой срок и
                  CVC. Данные никуда не отправляются.
                </Typography.Paragraph>
              </div>
            ) : (
              <div style={{ ...walletPanel, borderColor: `${selected.accent}55` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={methodMark}>{selected.mark}</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{selected.title}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>
                      {method === 'sbp'
                        ? 'Откроется экран подтверждения в банковском приложении (эмуляция).'
                        : method === 'mir_pay'
                          ? 'Подтвердите оплату в Мир Pay (эмуляция).'
                          : 'Подтвердите в приложении Т-Банка (эмуляция).'}
                    </div>
                  </div>
                </div>
                <div style={qrBox} aria-hidden>
                  <div style={qrInner} />
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    QR / deep-link · mock
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 20 }}>
          {done ? (
            <Button
              type="primary"
              size="large"
              block
              onClick={() => nav(`/lk/courses/${p.courseId}`, { replace: true })}
            >
              Перейти в кабинет
            </Button>
          ) : blocked ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Typography.Text type="danger">
                Платёж не завершён. Можно начать оплату снова со страницы курса.
              </Typography.Text>
              <Button size="large" onClick={() => nav(`/courses/${p.courseId}`)}>
                Вернуться к курсу
              </Button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                type="primary"
                size="large"
                block
                loading={busy === 'pay'}
                onClick={() => void runPay()}
              >
                {method === 'card'
                  ? `Оплатить ${amountLabel}`
                  : `Продолжить через ${selected.title}`}
              </Button>
              <Button
                size="large"
                block
                danger
                loading={busy === 'fail'}
                onClick={async () => {
                  if (method === 'card' && !validateBeforePay()) return;
                  setBusy('fail');
                  try {
                    await new Promise((r) => setTimeout(r, 600));
                    await fail.mutateAsync();
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Отказать в оплате (тест)
              </Button>
              <Button
                type="text"
                size="large"
                block
                loading={busy === 'cancel'}
                onClick={async () => {
                  setBusy('cancel');
                  try {
                    await cancel.mutateAsync();
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Отменить
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



const page: CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background:
    'radial-gradient(1200px 600px at 10% -10%, #dce9ff 0%, transparent 55%), radial-gradient(900px 500px at 100% 0%, #e8dff8 0%, transparent 50%), #f4f6fa',
};

const panel: CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: '#fff',
  borderRadius: 18,
  padding: '28px 28px 24px',
  border: '1px solid #e8e8e8',
  boxShadow: '0 18px 50px rgba(20, 30, 60, 0.08)',
};

const badge: CSSProperties = {
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#5b6b8c',
  background: '#eef2f8',
  borderRadius: 999,
  padding: '4px 10px',
};

const row: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 16,
};

const label: CSSProperties = {
  color: '#8c8c8c',
  fontSize: 13,
};

const methodGrid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 8,
};

const methodBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid #e5e7eb',
  background: '#fff',
  cursor: 'pointer',
  textAlign: 'left',
};

const methodMark: CSSProperties = {
  width: 36,
  height: 36,
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
};

const liveCard: CSSProperties = {
  margin: '0 0 14px',
  padding: '18px 20px',
  borderRadius: 14,
  color: '#fff',
  background: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
};

const walletPanel: CSSProperties = {
  marginTop: 18,
  padding: 16,
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const qrBox: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
  padding: '12px 0 4px',
};

const qrInner: CSSProperties = {
  width: 120,
  height: 120,
  borderRadius: 10,
  background:
    'repeating-linear-gradient(0deg,#0f172a 0 6px,#fff 6px 12px), repeating-linear-gradient(90deg,#0f172a 0 6px,#fff 6px 12px)',
  backgroundBlendMode: 'difference',
  opacity: 0.85,
};
