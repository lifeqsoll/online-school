import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Typography,
  Upload,
  message,
  Modal,
} from 'antd';
import { api, getAccessToken } from '../../shared/api/client';
import { FileList, FileUploadButton } from '../../shared/files/FileList';

type Lesson = {
  id: string;
  title: string;
  type: string;
  content?: string | null;
  isPublished: boolean;
  videoUrl?: string | null;
  videoSource?: string | null;
};

export function LessonEditPanel({
  lesson,
  onClose,
}: {
  lesson: Lesson;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (v: {
      title: string;
      type: string;
      content?: string;
      isPublished: boolean;
    }) =>
      api(`/lessons/${lesson.id}`, {
        method: 'PATCH',
        json: v,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course'] });
      message.success('Сохранено');
    },
  });

  const setExternal = useMutation({
    mutationFn: (url: string) =>
      api(`/lessons/${lesson.id}/video/external`, {
        method: 'PATCH',
        json: { url },
      }),
    onSuccess: () => message.success('Внешнее видео сохранено'),
  });

  return (
    <div>
      <Form
        layout="vertical"
        initialValues={{
          title: lesson.title,
          type: lesson.type,
          content: lesson.content ?? '',
          isPublished: lesson.isPublished,
          externalUrl: lesson.videoUrl ?? '',
        }}
        onFinish={async (v) => {
          try {
            await save.mutateAsync({
              title: v.title,
              type: v.type,
              content: v.content || undefined,
              isPublished: v.isPublished,
            });
            if (v.externalUrl?.trim()) {
              await setExternal.mutateAsync(v.externalUrl.trim());
            }
            onClose();
          } catch (e) {
            message.error(e instanceof Error ? e.message : 'Ошибка');
          }
        }}
      >
        <Form.Item name="title" label="Название" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="type" label="Тип" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'TEXT', label: 'Текст' },
              { value: 'VIDEO', label: 'Видео' },
              { value: 'MIXED', label: 'Смешанный' },
            ]}
          />
        </Form.Item>
        <Form.Item name="content" label="Текст урока">
          <Input.TextArea rows={4} />
        </Form.Item>
        <Form.Item name="isPublished" label="Опубликован" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="externalUrl" label="Внешнее видео (YouTube/Vimeo/URL)">
          <Input placeholder="https://..." />
        </Form.Item>
        <Form.Item label="Загрузить видеофайл">
          <Upload
            accept="video/*"
            maxCount={1}
            customRequest={async ({ file, onSuccess, onError }) => {
              try {
                const fd = new FormData();
                fd.append('file', file as File);
                const token = getAccessToken();
                const res = await fetch(
                  `${import.meta.env.VITE_API_URL ?? '/api'}/lessons/${lesson.id}/video/upload`,
                  {
                    method: 'POST',
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                    body: fd,
                  },
                );
                if (!res.ok) {
                  const t = await res.text();
                  throw new Error(t || res.statusText);
                }
                message.success('Видео загружено');
                qc.invalidateQueries({ queryKey: ['course'] });
                onSuccess?.(await res.json());
              } catch (e) {
                message.error(e instanceof Error ? e.message : 'Ошибка');
                onError?.(e as Error);
              }
            }}
            showUploadList={false}
          >
            <Button>Выбрать видео</Button>
          </Upload>
          {lesson.videoSource || lesson.videoUrl ? (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 10,
                background: 'rgba(190,170,242,0.1)',
                border: '1px solid rgba(190,170,242,0.3)',
              }}
            >
              <Typography.Text>
                Видео прикреплено
                {lesson.videoSource ? ` · ${lesson.videoSource}` : ''}
              </Typography.Text>
              {lesson.videoUrl ? (
                <div style={{ marginTop: 6 }}>
                  <a href={lesson.videoUrl} target="_blank" rel="noreferrer">
                    Открыть видео
                  </a>
                </div>
              ) : null}
            </div>
          ) : (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              Видео ещё не загружено
            </Typography.Text>
          )}
        </Form.Item>

        <Typography.Title level={5}>Материалы (PNG/PDF)</Typography.Title>
        <Space style={{ marginBottom: 8 }}>
          <FileUploadButton ownerType="LESSON_MATERIAL" ownerId={lesson.id} />
        </Space>
        <FileList ownerType="LESSON_MATERIAL" ownerId={lesson.id} />

        <Space style={{ marginTop: 16 }}>
          <Button type="primary" htmlType="submit" loading={save.isPending}>
            Сохранить
          </Button>
          <Button onClick={onClose}>Закрыть</Button>
          <Button
            danger
            onClick={() => {
              Modal.confirm({
                title: 'Удалить урок?',
                content: `«${lesson.title}» будет удалён безвозвратно.`,
                okText: 'Удалить',
                okType: 'danger',
                cancelText: 'Отмена',
                onOk: async () => {
                  try {
                    await api(`/lessons/${lesson.id}`, { method: 'DELETE' });
                    message.success('Урок удалён');
                    qc.invalidateQueries({ queryKey: ['course'] });
                    onClose();
                  } catch (e) {
                    message.error(e instanceof Error ? e.message : 'Ошибка');
                  }
                },
              });
            }}
          >
            Удалить урок
          </Button>
        </Space>
      </Form>
    </div>
  );
}
