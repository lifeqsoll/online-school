import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Drawer,
  Empty,
  Rate,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useState } from 'react';
import { api } from '../../shared/api/client';

type PendingReview = {
  id: string;
  rating: number;
  body?: string | null;
  createdAt: string;
  authorName: string;
  isEdit?: boolean;
  published?: { rating: number; body?: string | null } | null;
  course: { id: string; title: string };
  photos: Array<{ id: string; url: string; originalName: string }>;
};

export function StaffReviewsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<PendingReview | null>(null);

  const list = useQuery({
    queryKey: ['reviews-pending'],
    queryFn: () => api<PendingReview[]>('/reviews/pending'),
    refetchInterval: 20_000,
  });

  const moderate = useMutation({
    mutationFn: (p: { id: string; status: 'APPROVED' | 'REJECTED' }) =>
      api(`/reviews/${p.id}/moderate`, {
        method: 'PATCH',
        json: { status: p.status },
      }),
    onSuccess: async (_r, vars) => {
      message.success(vars.status === 'APPROVED' ? 'Одобрено' : 'Отклонено');
      setOpen(null);
      await qc.invalidateQueries({ queryKey: ['reviews-pending'] });
      await qc.invalidateQueries({ queryKey: ['reviews-pending-count'] });
      await qc.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (e: Error) => message.error(e.message || 'Ошибка'),
  });

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Отзывы на модерацию
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        После одобрения отзыв появится в каталоге. При правке старая версия
        остаётся видимой, пока не одобрите новую. Нажмите на строку, чтобы
        прочитать полный текст.
      </Typography.Paragraph>

      {!list.data?.length && !list.isLoading ? (
        <Empty description="Нет отзывов на проверке" />
      ) : (
        <Table
          rowKey="id"
          loading={list.isLoading}
          dataSource={list.data ?? []}
          pagination={false}
          onRow={(r) => ({
            onClick: () => setOpen(r),
            style: { cursor: 'pointer' },
          })}
          columns={[
            {
              title: 'Курс',
              render: (_: unknown, r: PendingReview) => (
                <span>
                  {r.course.title}
                  {r.isEdit ? (
                    <Tag color="blue" style={{ marginLeft: 8 }}>
                      правка
                    </Tag>
                  ) : null}
                </span>
              ),
            },
            {
              title: 'Автор',
              dataIndex: 'authorName',
            },
            {
              title: 'Оценка',
              render: (_: unknown, r: PendingReview) => (
                <div>
                  <Rate disabled value={r.rating} style={{ fontSize: 14 }} />
                  {r.isEdit && r.published ? (
                    <Typography.Text
                      type="secondary"
                      style={{ display: 'block', fontSize: 12 }}
                    >
                      было: {r.published.rating}★
                    </Typography.Text>
                  ) : null}
                </div>
              ),
            },
            {
              title: 'Текст',
              dataIndex: 'body',
              render: (v: string | null) => (
                <Typography.Paragraph
                  ellipsis={{ rows: 2, expandable: false }}
                  style={{ marginBottom: 0, maxWidth: 360 }}
                >
                  {v || '—'}
                </Typography.Paragraph>
              ),
            },
            {
              title: 'Фото',
              width: 140,
              render: (_: unknown, r: PendingReview) =>
                r.photos?.length ? (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {r.photos.slice(0, 3).map((p) => (
                      <img
                        key={p.id}
                        src={p.url}
                        alt={p.originalName}
                        style={{
                          width: 36,
                          height: 36,
                          objectFit: 'cover',
                          borderRadius: 4,
                        }}
                      />
                    ))}
                    {r.photos.length > 3 ? (
                      <Tag>+{r.photos.length - 3}</Tag>
                    ) : null}
                  </div>
                ) : (
                  '—'
                ),
            },
            {
              title: '',
              width: 200,
              render: (_: unknown, r) => (
                <Space
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    type="primary"
                    size="small"
                    loading={moderate.isPending}
                    onClick={() =>
                      moderate.mutate({ id: r.id, status: 'APPROVED' })
                    }
                  >
                    Одобрить
                  </Button>
                  <Button
                    danger
                    size="small"
                    loading={moderate.isPending}
                    onClick={() =>
                      moderate.mutate({ id: r.id, status: 'REJECTED' })
                    }
                  >
                    Отклонить
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      )}

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        size={520}
        title={open ? open.course.title : 'Отзыв'}
        extra={
          open ? (
            <Space>
              <Button
                type="primary"
                loading={moderate.isPending}
                onClick={() =>
                  moderate.mutate({ id: open.id, status: 'APPROVED' })
                }
              >
                Одобрить
              </Button>
              <Button
                danger
                loading={moderate.isPending}
                onClick={() =>
                  moderate.mutate({ id: open.id, status: 'REJECTED' })
                }
              >
                Отклонить
              </Button>
            </Space>
          ) : null
        }
      >
        {open ? (
          <div>
            <Space style={{ marginBottom: 12 }} wrap>
              <Typography.Text strong>{open.authorName}</Typography.Text>
              {open.isEdit ? <Tag color="blue">правка</Tag> : null}
            </Space>
            <div style={{ marginBottom: 16 }}>
              <Rate disabled value={open.rating} />
            </div>
            <Typography.Paragraph
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: 15,
                lineHeight: 1.55,
              }}
            >
              {open.body?.trim() || 'Без текста'}
            </Typography.Paragraph>

            {open.isEdit && open.published ? (
              <div
                style={{
                  marginTop: 8,
                  marginBottom: 16,
                  padding: 12,
                  background: '#fafafa',
                  borderRadius: 8,
                  border: '1px solid #f0f0f0',
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Сейчас в каталоге ({open.published.rating}★)
                </Typography.Text>
                <Typography.Paragraph
                  type="secondary"
                  style={{ whiteSpace: 'pre-wrap', marginBottom: 0, marginTop: 6 }}
                >
                  {open.published.body?.trim() || 'Без текста'}
                </Typography.Paragraph>
              </div>
            ) : null}

            {open.photos?.length ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {open.photos.map((p) => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                    <img
                      src={p.url}
                      alt={p.originalName}
                      style={{
                        width: 120,
                        height: 120,
                        objectFit: 'cover',
                        borderRadius: 8,
                      }}
                    />
                  </a>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
