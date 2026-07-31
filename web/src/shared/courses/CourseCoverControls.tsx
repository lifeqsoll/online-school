import { Button, Space, Upload, message } from 'antd';
import { getAccessToken } from '../api/client';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export async function uploadCourseCover(courseId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}/courses/${courseId}/cover`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || res.statusText);
  }
  return res.json() as Promise<{ coverUrl?: string | null }>;
}

export function CourseCoverControls({
  courseId,
  coverUrl,
  onChanged,
}: {
  courseId: string;
  coverUrl?: string | null;
  onChanged?: () => void;
}) {
  return (
    <Space wrap align="start">
      {coverUrl ? (
        <div
          style={{
            width: 120,
            height: 72,
            borderRadius: 10,
            overflow: 'hidden',
            background: `#111 url(${coverUrl}) center/cover`,
            border: '1px solid #ebebeb',
            flexShrink: 0,
          }}
        />
      ) : null}
      <Upload
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        showUploadList={false}
        customRequest={async ({ file, onSuccess, onError }) => {
          try {
            await uploadCourseCover(courseId, file as File);
            message.success('Обложка обновлена');
            onChanged?.();
            onSuccess?.({});
          } catch (e) {
            message.error(e instanceof Error ? e.message : 'Ошибка');
            onError?.(e as Error);
          }
        }}
      >
        <Button>{coverUrl ? 'Заменить обложку' : 'Загрузить обложку'}</Button>
      </Upload>
      {coverUrl ? (
        <Button
          danger
          onClick={async () => {
            try {
              const token = getAccessToken();
              const res = await fetch(`${API_BASE}/courses/${courseId}/cover`, {
                method: 'DELETE',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
              });
              if (!res.ok) throw new Error(await res.text());
              message.success('Обложка удалена');
              onChanged?.();
            } catch (e) {
              message.error(e instanceof Error ? e.message : 'Ошибка');
            }
          }}
        >
          Удалить
        </Button>
      ) : null}
    </Space>
  );
}
