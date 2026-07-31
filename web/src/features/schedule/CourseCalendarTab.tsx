import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  DatePicker,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useMemo, useState } from 'react';
import { api, ApiError } from '../../shared/api/client';
import { FileList, FileUploadButton } from '../../shared/files/FileList';
import { CalendarView, type CalEvent } from './CalendarView';

type Props = {
  courseId: string;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{ id: string; title: string }>;
  }>;
};

type Assignment = { id: string; title: string };

type EditorState =
  | { mode: 'create'; day?: Dayjs }
  | { mode: 'edit'; event: CalEvent };

export function CourseCalendarTab({ courseId, modules }: Props) {
  const qc = useQueryClient();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [form] = Form.useForm();
  const from = dayjs().startOf('month').subtract(7, 'day').toISOString();
  const to = dayjs().endOf('month').add(7, 'day').toISOString();

  const events = useQuery({
    queryKey: ['course-events', courseId, from, to],
    queryFn: () =>
      api<CalEvent[]>(
        `/courses/${courseId}/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });

  const assignments = useQuery({
    queryKey: ['assignments', courseId],
    queryFn: () => api<Assignment[]>(`/courses/${courseId}/assignments`),
  });

  const lessonOptions = useMemo(
    () =>
      modules.flatMap((m) =>
        m.lessons.map((l) => ({
          value: l.id,
          label: `${m.title} / ${l.title}`,
        })),
      ),
    [modules],
  );

  const openCreate = (day?: Dayjs) => {
    const starts = (day ?? dayjs()).hour(12).minute(0).second(0);
    setEditor({ mode: 'create', day });
    form.setFieldsValue({
      type: 'LIVE',
      title: '',
      startsAt: starts,
      endsAt: starts.add(1, 'hour'),
      meetingUrl: undefined,
      lessonId: undefined,
      assignmentId: undefined,
      description: undefined,
    });
  };

  const openEdit = (event: CalEvent) => {
    setEditor({ mode: 'edit', event });
    form.setFieldsValue({
      type: event.type,
      title: event.title,
      startsAt: dayjs(event.startsAt),
      endsAt: event.endsAt ? dayjs(event.endsAt) : undefined,
      meetingUrl: event.meetingUrl ?? undefined,
      lessonId: event.lessonId ?? undefined,
      assignmentId: event.assignmentId ?? undefined,
      description: event.description ?? undefined,
    });
  };

  const closeEditor = () => {
    setEditor(null);
    form.resetFields();
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<CalEvent>(`/courses/${courseId}/events`, {
        method: 'POST',
        json: body,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['course-events', courseId] });
      message.success('Событие создано — можно добавить файлы');
      openEdit(created);
    },
  });

  const update = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Record<string, unknown>;
    }) => api(`/events/${id}`, { method: 'PATCH', json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-events', courseId] });
      message.success('Сохранено');
      closeEditor();
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-events', courseId] });
      message.success('Удалено');
      closeEditor();
    },
  });

  const editingId = editor?.mode === 'edit' ? editor.event.id : null;

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => openCreate()}>
          Создать событие
        </Button>
      </Space>
      <CalendarView
        events={events.data ?? []}
        mode="month"
        onCreateAtDay={openCreate}
        onEditEvent={openEdit}
      />
      <Typography.Title level={5} style={{ marginTop: 20 }}>
        Список
      </Typography.Title>
      <List
        dataSource={events.data ?? []}
        renderItem={(e) => (
          <List.Item
            actions={[
              <Button key="edit" type="link" onClick={() => openEdit(e)}>
                Изменить
              </Button>,
              <Button
                key="del"
                danger
                type="link"
                onClick={() => remove.mutate(e.id)}
              >
                Удалить
              </Button>,
            ]}
          >
            [{e.type}] {e.title} · {dayjs(e.startsAt).format('DD.MM.YYYY HH:mm')}
          </List.Item>
        )}
      />

      <Modal
        open={!!editor}
        onCancel={closeEditor}
        footer={null}
        title={editor?.mode === 'edit' ? 'Редактировать событие' : 'Новое событие'}
        destroyOnClose
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            const body = {
              title: v.title,
              type: v.type,
              startsAt: v.startsAt.toISOString(),
              endsAt: v.endsAt ? v.endsAt.toISOString() : undefined,
              meetingUrl: v.meetingUrl || undefined,
              lessonId: v.lessonId || undefined,
              assignmentId: v.assignmentId || undefined,
              description: v.description || undefined,
            };
            try {
              if (editor?.mode === 'edit') {
                await update.mutateAsync({ id: editor.event.id, body });
              } else {
                await create.mutateAsync(body);
              }
            } catch (e) {
              message.error(
                e instanceof ApiError || e instanceof Error
                  ? e.message
                  : 'Ошибка',
              );
            }
          }}
        >
          <Form.Item name="type" label="Тип" rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'LIVE', label: 'Занятие (LIVE)' },
                { value: 'DEADLINE', label: 'Дедлайн' },
              ]}
            />
          </Form.Item>
          <Form.Item name="title" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="startsAt"
            label="Начало / срок"
            rules={[{ required: true }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="endsAt" label="Конец (для LIVE)">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="meetingUrl" label="Ссылка на встречу">
            <Input placeholder="https://..." />
          </Form.Item>
          <Form.Item name="lessonId" label="Урок">
            <Select allowClear options={lessonOptions} />
          </Form.Item>
          <Form.Item name="assignmentId" label="Задание">
            <Select
              allowClear
              options={(assignments.data ?? []).map((a) => ({
                value: a.id,
                label: a.title,
              }))}
            />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={2} />
          </Form.Item>

          {editingId ? (
            <div
              style={{
                marginBottom: 16,
                padding: 12,
                borderRadius: 12,
                background: 'rgba(190,170,242,0.08)',
                border: '1px solid rgba(190,170,242,0.25)',
              }}
            >
              <Typography.Title level={5} style={{ marginTop: 0 }}>
                Файлы и видео
              </Typography.Title>
              <Space wrap style={{ marginBottom: 8 }}>
                <FileUploadButton
                  ownerType="COURSE_EVENT_MATERIAL"
                  ownerId={editingId}
                  label="Фото / файл"
                  accept=".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf"
                />
                <FileUploadButton
                  ownerType="COURSE_EVENT_MATERIAL"
                  ownerId={editingId}
                  label="Видео"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                />
              </Space>
              <FileList
                ownerType="COURSE_EVENT_MATERIAL"
                ownerId={editingId}
              />
            </div>
          ) : (
            <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
              После создания события можно будет прикрепить файлы и видео
            </Typography.Paragraph>
          )}

          <Space style={{ width: '100%' }} direction="vertical">
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={create.isPending || update.isPending}
            >
              {editor?.mode === 'edit' ? 'Сохранить' : 'Создать'}
            </Button>
            {editingId ? (
              <Button
                danger
                block
                loading={remove.isPending}
                onClick={() => {
                  Modal.confirm({
                    title: 'Удалить событие?',
                    okText: 'Удалить',
                    okType: 'danger',
                    cancelText: 'Отмена',
                    onOk: () => remove.mutateAsync(editingId),
                  });
                }}
              >
                Удалить событие
              </Button>
            ) : null}
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
