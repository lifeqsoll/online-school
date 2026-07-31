import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Typography,
  Upload,
  message,
  Modal,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
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
  scheduledAt?: string | null;
  meetingUrl?: string | null;
  contentUnlockDaysBefore?: number;
  contentUnlockedForAll?: boolean;
};

export function LessonEditPanel({
  lesson,
  courseId,
  onClose,
}: {
  lesson: Lesson;
  courseId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [grantUserId, setGrantUserId] = useState('');

  const save = useMutation({
    mutationFn: (v: {
      title: string;
      type: string;
      content?: string;
      isPublished: boolean;
      scheduledAt: string | null;
      meetingUrl: string | null;
      contentUnlockDaysBefore: number;
    }) =>
      api(`/lessons/${lesson.id}`, {
        method: 'PATCH',
        json: v,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course'] });
      if (courseId) {
        qc.invalidateQueries({ queryKey: ['course-events', courseId] });
      }
      qc.invalidateQueries({ queryKey: ['me-calendar'] });
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
          scheduledAt: lesson.scheduledAt ? dayjs(lesson.scheduledAt) : null,
          meetingUrl: lesson.meetingUrl ?? '',
          contentUnlockDaysBefore: lesson.contentUnlockDaysBefore ?? 7,
        }}
        onFinish={async (v) => {
          try {
            await save.mutateAsync({
              title: v.title,
              type: v.type,
              content: v.content || undefined,
              isPublished: v.isPublished,
              scheduledAt: v.scheduledAt
                ? (v.scheduledAt as dayjs.Dayjs).toISOString()
                : null,
              meetingUrl: v.meetingUrl?.trim() ? v.meetingUrl.trim() : null,
              contentUnlockDaysBefore: Number(v.contentUnlockDaysBefore ?? 7),
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

        <Typography.Title level={5} style={{ marginTop: 8 }}>
          Дата в календаре
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Дата ставит урок в календарь. Тип LIVE (иконка камеры) — только если
          указана ссылка на встречу ниже. Текст / Видео / Смешанный — по
          содержимому урока.
        </Typography.Paragraph>
        <Form.Item name="scheduledAt" label="Дата и время урока">
          <DatePicker
            showTime
            format="DD.MM.YYYY HH:mm"
            style={{ width: '100%' }}
            allowClear
            placeholder="Без даты — только в программе курса"
          />
        </Form.Item>
        <Form.Item
          name="meetingUrl"
          label="Ссылка на встречу"
          rules={[{ type: 'url', message: 'Нужен полный URL (https://...)' }]}
        >
          <Input placeholder="https://meet.jit.si/..." allowClear />
        </Form.Item>

        <Typography.Title level={5} style={{ marginTop: 8 }}>
          Открытие материалов
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          В календаре урок виден всегда. Видео, файлы и ссылка открываются за N
          дней до даты (по умолчанию 7). Можно открыть всем сразу или одному
          ученику по ID.
        </Typography.Paragraph>
        <Form.Item
          name="contentUnlockDaysBefore"
          label="Открыть материалы за N дней до урока"
        >
          <InputNumber min={0} max={365} style={{ width: '100%' }} />
        </Form.Item>
        <Space wrap style={{ marginBottom: 16 }}>
          <Button
            onClick={async () => {
              try {
                await api(`/lessons/${lesson.id}/content/unlock-all`, {
                  method: 'POST',
                });
                message.success('Материалы открыты для всех');
                qc.invalidateQueries({ queryKey: ['course'] });
                qc.invalidateQueries({ queryKey: ['me-calendar'] });
              } catch (e) {
                message.error(e instanceof Error ? e.message : 'Ошибка');
              }
            }}
          >
            Открыть всем сейчас
          </Button>
          <Button
            onClick={async () => {
              try {
                await api(`/lessons/${lesson.id}/content/lock-schedule`, {
                  method: 'POST',
                });
                message.success('Снова по расписанию (N дней)');
                qc.invalidateQueries({ queryKey: ['course'] });
                qc.invalidateQueries({ queryKey: ['me-calendar'] });
              } catch (e) {
                message.error(e instanceof Error ? e.message : 'Ошибка');
              }
            }}
          >
            Вернуть расписание
          </Button>
        </Space>
        {lesson.contentUnlockedForAll ? (
          <Typography.Text type="success" style={{ display: 'block', marginBottom: 12 }}>
            Сейчас открыто для всех вручную
          </Typography.Text>
        ) : null}
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="User ID ученика"
            value={grantUserId}
            onChange={(e) => setGrantUserId(e.target.value)}
          />
          <Button
            onClick={async () => {
              if (!grantUserId.trim()) {
                message.error('Укажите User ID');
                return;
              }
              try {
                await api(`/lessons/${lesson.id}/content/grants`, {
                  method: 'POST',
                  json: { userId: grantUserId.trim() },
                });
                message.success('Ученику открыт доступ к материалам');
                setGrantUserId('');
              } catch (e) {
                message.error(e instanceof Error ? e.message : 'Ошибка');
              }
            }}
          >
            Открыть одному
          </Button>
        </Space.Compact>

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
                    if (courseId) {
                      qc.invalidateQueries({
                        queryKey: ['course-events', courseId],
                      });
                    }
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
