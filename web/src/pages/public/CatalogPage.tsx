import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Empty, Space, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { getAccessToken } from '../../shared/api/client';

type Course = {
  id: string;
  title: string;
  description?: string | null;
  priceCents: number;
  isPublished: boolean;
};

export function CatalogPage() {
  const [freeOnly, setFreeOnly] = useState(false);
  const q = useQuery({
    queryKey: ['courses', 'public'],
    queryFn: () =>
      api<Course[]>('/courses', {
        auth: getAccessToken() ? true : false,
      }),
  });

  const rows = (q.data ?? []).filter((c) => !freeOnly || c.priceCents === 0);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>
          Каталог курсов
        </Typography.Title>
        <Checkbox checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)}>
          Только бесплатные
        </Checkbox>
      </Space>

      {!rows.length && !q.isLoading ? (
        <Empty description="Пока нет опубликованных курсов" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {rows.map((c) => (
            <div
              key={c.id}
              style={{
                display: 'flex',
                gap: 20,
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px 22px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: '#fff',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: 1, minWidth: 220 }}>
                <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 6 }}>
                  {c.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                  {c.description || 'Описание скоро появится'}
                </Typography.Paragraph>
                <Typography.Text strong>
                  {c.priceCents === 0
                    ? 'Бесплатно'
                    : `${(c.priceCents / 100).toFixed(0)} ₽`}
                </Typography.Text>
              </div>
              <Link to={`/courses/${c.id}`}>
                <Button type="primary">Подробнее</Button>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
