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
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { api, ApiError } from '../../shared/api/client';
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

export function CourseCalendarTab({ courseId, modules }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
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
        m.lessons.map((l) => ({ value: l.id, label: `${m.title} / ${l.title}` })),
      ),
    [modules],
  );

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api(`/courses/${courseId}/events`, { method: 'POST', json: body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-events', courseId] });
      setOpen(false);
      message.success('Событие создано');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/events/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-events', courseId] });
      message.success('Удалено');
    },
  });

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button type="primary" onClick={() => setOpen(true)}>
          Создать событие
        </Button>
      </Space>
      <CalendarView events={events.data ?? []} mode="month" />
      <Typography.Title level={5} style={{ marginTop: 20 }}>
        Список
      </Typography.Title>
      <List
        dataSource={events.data ?? []}
        renderItem={(e) => (
          <List.Item
            actions={[
              <Button key="del" danger type="link" onClick={() => remove.mutate(e.id)}>
                Удалить
              </Button>,
            ]}
          >
            [{e.type}] {e.title} · {dayjs(e.startsAt).format('DD.MM.YYYY HH:mm')}
          </List.Item>
        )}
      />

      <Modal open={open} onCancel={() => setOpen(false)} footer={null} title="Событие" destroyOnClose>
        <Form
          layout="vertical"
          initialValues={{ type: 'LIVE' }}
          onFinish={async (v) => {
            try {
              await create.mutateAsync({
                title: v.title,
                type: v.type,
                startsAt: v.startsAt.toISOString(),
                endsAt: v.endsAt ? v.endsAt.toISOString() : undefined,
                meetingUrl: v.meetingUrl,
                lessonId: v.lessonId,
                assignmentId: v.assignmentId,
                description: v.description,
              });
            } catch (e) {
              message.error(
                e instanceof ApiError || e instanceof Error ? e.message : 'Ошибка',
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
          <Form.Item name="startsAt" label="Начало / срок" rules={[{ required: true }]}>
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
          <Button type="primary" htmlType="submit" block loading={create.isPending}>
            Сохранить
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
