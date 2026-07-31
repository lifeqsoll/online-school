import { Button, Form, Input, Space, Typography, Upload, message } from 'antd';
import { getAccessToken } from '../api/client';
import { FileList, FileUploadButton } from '../files/FileList';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

type PromoPlayback = { kind: string; url: string } | null;

export function CourseCatalogMediaControls({
  courseId,
  promoPlayback,
  onChanged,
}: {
  courseId: string;
  promoPlayback?: PromoPlayback;
  onChanged?: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Промо-видео для каталога
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          Показывается на публичной странице курса вместе с описанием.
        </Typography.Paragraph>
        {promoPlayback ? (
          <div
            style={{
              marginBottom: 12,
              borderRadius: 14,
              overflow: 'hidden',
              background: '#111',
              aspectRatio: '16 / 9',
              maxWidth: 420,
            }}
          >
            {promoPlayback.kind === 'youtube' || promoPlayback.kind === 'vimeo' ? (
              <iframe
                title="promo"
                src={toEmbedUrl(promoPlayback.url, promoPlayback.kind)}
                style={{ width: '100%', height: '100%', border: 0 }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video
                src={promoPlayback.url}
                controls
                style={{ width: '100%', height: '100%' }}
              />
            )}
          </div>
        ) : (
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            Видео ещё не добавлено
          </Typography.Text>
        )}
        <Form
          layout="inline"
          onFinish={async (v: { url: string }) => {
            try {
              const token = getAccessToken();
              const res = await fetch(
                `${API_BASE}/courses/${courseId}/promo-video/external`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ url: v.url }),
                },
              );
              if (!res.ok) throw new Error(await res.text());
              message.success('Ссылка на видео сохранена');
              onChanged?.();
            } catch (e) {
              message.error(e instanceof Error ? e.message : 'Ошибка');
            }
          }}
          style={{ marginBottom: 10 }}
        >
          <Form.Item
            name="url"
            rules={[{ required: true, message: 'URL' }]}
            style={{ flex: 1, minWidth: 220 }}
          >
            <Input placeholder="https://youtube.com/... или прямая ссылка" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">
              Сохранить ссылку
            </Button>
          </Form.Item>
        </Form>
        <Space wrap>
          <Upload
            accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
            showUploadList={false}
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                const fd = new FormData();
                fd.append('file', file as File);
                const token = getAccessToken();
                const res = await fetch(
                  `${API_BASE}/courses/${courseId}/promo-video/upload`,
                  {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    body: fd,
                  },
                );
                if (!res.ok) throw new Error(await res.text());
                message.success('Видео загружено');
                onChanged?.();
                onSuccess?.({});
              } catch (e) {
                message.error(e instanceof Error ? e.message : 'Ошибка');
                onError?.(e as Error);
              }
            }}
          >
            <Button>Загрузить файл</Button>
          </Upload>
          {promoPlayback ? (
            <Button
              danger
              onClick={async () => {
                try {
                  const token = getAccessToken();
                  const res = await fetch(
                    `${API_BASE}/courses/${courseId}/promo-video`,
                    {
                      method: 'DELETE',
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                    },
                  );
                  if (!res.ok) throw new Error(await res.text());
                  message.success('Видео удалено');
                  onChanged?.();
                } catch (e) {
                  message.error(e instanceof Error ? e.message : 'Ошибка');
                }
              }}
            >
              Удалить видео
            </Button>
          ) : null}
        </Space>
      </div>

      <div>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Материалы для ознакомления
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          PDF, фото и документы — посетители смогут скачать на странице курса.
        </Typography.Paragraph>
        <Space style={{ marginBottom: 12 }}>
          <FileUploadButton
            ownerType="COURSE_MATERIAL"
            ownerId={courseId}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.ppt,.pptx,.txt,application/pdf,image/*"
            label="Загрузить файл"
          />
        </Space>
        <FileList ownerType="COURSE_MATERIAL" ownerId={courseId} canDelete />
      </div>
    </div>
  );
}

function toEmbedUrl(url: string, kind: string): string {
  if (kind === 'youtube') {
    try {
      const u = new URL(url);
      const id =
        u.hostname.includes('youtu.be')
          ? u.pathname.slice(1)
          : u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    } catch {
      /* fallthrough */
    }
  }
  if (kind === 'vimeo') {
    const m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return url;
}
