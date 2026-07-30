import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Empty, Space, Typography } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../../shared/api/client';
import { getAccessToken } from '../../shared/api/client';
import { easeOutExpo, fadeUp, stagger } from '../../shared/motion';

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
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
      >
        <motion.div variants={fadeUp} custom={0}>
          <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }}>
            <Typography.Title level={2} style={{ margin: 0 }}>
              Каталог курсов
            </Typography.Title>
            <Checkbox checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)}>
              Только бесплатные
            </Checkbox>
          </Space>
        </motion.div>

        {!rows.length && !q.isLoading ? (
          <motion.div variants={fadeUp} custom={1}>
            <Empty description="Пока нет опубликованных курсов" />
          </motion.div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {rows.map((c, i) => (
              <motion.div
                key={c.id}
                variants={fadeUp}
                custom={i + 1}
                whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(190, 170, 242, 0.22)' }}
                transition={{ duration: 0.22, ease: easeOutExpo }}
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
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
