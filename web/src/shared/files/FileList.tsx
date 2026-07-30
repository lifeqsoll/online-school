import { Button, List, Typography, message } from 'antd';
import { DeleteOutlined, DownloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export type StoredFileRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export function FileList({
  ownerType,
  ownerId,
  canDelete = true,
}: {
  ownerType: 'LESSON_MATERIAL' | 'ASSIGNMENT_MATERIAL' | 'SUBMISSION_ATTACHMENT';
  ownerId: string;
  canDelete?: boolean;
}) {
  const qc = useQueryClient();
  const key = ['files', ownerType, ownerId];
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

  const download = async (id: string) => {
    const res = await api<{ url: string }>(`/files/${id}/download`);
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
    <List
      size="small"
      dataSource={q.data}
      renderItem={(f) => (
        <List.Item
          actions={[
            <Button
              key="dl"
              type="link"
              icon={<DownloadOutlined />}
              onClick={() => download(f.id)}
            >
              Скачать
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
                        message.error(e instanceof Error ? e.message : 'Ошибка');
                      }
                    }}
                  />,
                ]
              : []),
          ]}
        >
          {f.originalName}{' '}
          <Typography.Text type="secondary">
            ({Math.round(f.sizeBytes / 1024)} КБ)
          </Typography.Text>
        </List.Item>
      )}
    />
  );
}

export function FileUploadButton({
  ownerType,
  ownerId,
  label = 'Загрузить PNG/PDF',
}: {
  ownerType: 'LESSON_MATERIAL' | 'ASSIGNMENT_MATERIAL' | 'SUBMISSION_ATTACHMENT';
  ownerId: string;
  label?: string;
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
          accept=".png,.pdf,image/png,application/pdf"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              await upload.mutateAsync(file);
              message.success('Загружено');
            } catch (err) {
              message.error(err instanceof Error ? err.message : 'Ошибка');
            }
          }}
        />
      </label>
    </Button>
  );
}
