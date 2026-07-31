import { Button, List, Modal, Space, Typography, message } from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';

export type FileOwnerType =
  | 'LESSON_MATERIAL'
  | 'ASSIGNMENT_MATERIAL'
  | 'SUBMISSION_ATTACHMENT'
  | 'COURSE_EVENT_MATERIAL';

export type StoredFileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

function isVideoMime(mime: string) {
  return mime.startsWith('video/');
}

function isImageMime(mime: string) {
  return mime.startsWith('image/');
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}

export function FileList({
  ownerType,
  ownerId,
  canDelete = true,
}: {
  ownerType: FileOwnerType;
  ownerId: string;
  canDelete?: boolean;
}) {
  const qc = useQueryClient();
  const key = ['files', ownerType, ownerId];
  const [preview, setPreview] = useState<{
    url: string;
    name: string;
    mime: string;
  } | null>(null);

  const q = useQuery({
    queryKey: key,
    queryFn: () =>
      api<StoredFileRow[]>(
        `/files?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`,
      ),
    enabled: !!ownerId,
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/files/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const openFile = async (f: StoredFileRow) => {
    const res = await api<{ url: string; mimeType?: string }>(
      `/files/${f.id}/download`,
    );
    if (isVideoMime(f.mimeType) || isImageMime(f.mimeType)) {
      setPreview({ url: res.url, name: f.originalName, mime: f.mimeType });
      return;
    }
    window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  if (!q.data?.length) {
    return (
      <div>
        <Typography.Text type="secondary">Файлов пока нет</Typography.Text>
      </div>
    );
  }

  return (
    <>
      <List
        size="small"
        dataSource={q.data}
        renderItem={(f) => {
          const video = isVideoMime(f.mimeType);
          const image = isImageMime(f.mimeType);
          return (
            <List.Item
              actions={[
                <Button
                  key="open"
                  type="link"
                  icon={
                    video || image ? (
                      <PlayCircleOutlined />
                    ) : (
                      <DownloadOutlined />
                    )
                  }
                  onClick={() => openFile(f)}
                >
                  {video ? 'Смотреть' : image ? 'Открыть' : 'Скачать'}
                </Button>,
                ...(canDelete
                  ? [
                      <Button
                        key="rm"
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        loading={del.isPending}
                        onClick={async () => {
                          try {
                            await del.mutateAsync(f.id);
                            message.success('Удалено');
                          } catch (e) {
                            message.error(
                              e instanceof Error ? e.message : 'Ошибка',
                            );
                          }
                        }}
                      />,
                    ]
                  : []),
              ]}
            >
              <Space>
                {video || image ? (
                  <PlayCircleOutlined style={{ color: '#6b4fb8' }} />
                ) : (
                  <FileOutlined style={{ color: '#8c8c8c' }} />
                )}
                <span>
                  {f.originalName}{' '}
                  <Typography.Text type="secondary">
                    ({formatSize(f.sizeBytes)}
                    {video ? ' · видео' : image ? ' · фото' : ''})
                  </Typography.Text>
                </span>
              </Space>
            </List.Item>
          );
        }}
      />
      <Modal
        open={!!preview}
        title={preview?.name}
        onCancel={() => setPreview(null)}
        footer={null}
        width={720}
        destroyOnClose
      >
        {preview ? (
          isVideoMime(preview.mime) ? (
            <video
              key={preview.url}
              src={preview.url}
              controls
              style={{ width: '100%', maxHeight: '70vh', background: '#000' }}
            />
          ) : (
            <img
              key={preview.url}
              src={preview.url}
              alt={preview.name}
              style={{
                width: '100%',
                maxHeight: '70vh',
                objectFit: 'contain',
                background: '#f5f5f5',
              }}
            />
          )
        ) : null}
      </Modal>
    </>
  );
}

export function FileUploadButton({
  ownerType,
  ownerId,
  label = 'Загрузить PNG/PDF',
  accept = '.png,.pdf,image/png,application/pdf',
}: {
  ownerType: FileOwnerType;
  ownerId: string;
  label?: string;
  accept?: string;
}) {
  const qc = useQueryClient();
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('ownerType', ownerType);
      fd.append('ownerId', ownerId);
      return api('/files', { method: 'POST', body: fd });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['files', ownerType, ownerId] }),
  });

  return (
    <Button loading={upload.isPending}>
      <label style={{ cursor: 'pointer' }}>
        {label}
        <input
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              await upload.mutateAsync(file);
              message.success(
                file.type.startsWith('video/')
                  ? 'Видео добавлено'
                  : 'Файл загружен',
              );
            } catch (err) {
              message.error(err instanceof Error ? err.message : 'Ошибка');
            }
          }}
        />
      </label>
    </Button>
  );
}
