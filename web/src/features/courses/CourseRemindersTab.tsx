import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, List, Popconfirm, Typography, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { api } from '../../shared/api/client';

type Reminder = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

export function CourseRemindersTab({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [form] = Form.useForm();

  const list = useQuery({
    queryKey: ['course-reminders', courseId],
    queryFn: () => api<Reminder[]>(`/courses/${courseId}/reminders`),
  });

  const create = useMutation({
    mutationFn: (v: { title: string; body: string }) =>
      api(`/courses/${courseId}/reminders`, { method: 'POST', json: v }),
    onSuccess: async () => {
      message.success('Напоминание отправлено ученикам');
      form.resetFields();
      await qc.invalidateQueries({ queryKey: ['course-reminders', courseId] });
      await qc.invalidateQueries({
        queryKey: ['course-reminders-student', courseId],
      });
    },
    onError: (e: Error) => message.error(e.message || 'Ошибка'),
  });

  const remove = useMutation({
    mutationFn: (reminderId: string) =>
      api(`/courses/${courseId}/reminders/${reminderId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      message.success('Напоминание удалено');
      await qc.invalidateQueries({ queryKey: ['course-reminders', courseId] });
      await qc.invalidateQueries({
        queryKey: ['course-reminders-student', courseId],
      });
    },
    onError: (e: Error) => message.error(e.message || 'Ошибка'),
  });

  return (
    <div style={{ maxWidth: 640 }}>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Напоминание сразу всплывёт у всех активных учеников курса, как сообщение
        в мессенджере.
      </Typography.Paragraph>

      <Form
        form={form}
        layout="vertical"
        onFinish={(v) => create.mutate(v)}
        style={{ marginBottom: 28 }}
      >
        <Form.Item
          name="title"
          label="Заголовок"
          rules={[{ required: true, message: 'Введите заголовок' }]}
        >
          <Input maxLength={120} placeholder="Например: Не забудьте сдать ДЗ" />
        </Form.Item>
        <Form.Item
          name="body"
          label="Текст"
          rules={[{ required: true, message: 'Введите текст' }]}
        >
          <Input.TextArea
            rows={4}
            maxLength={2000}
            showCount
            placeholder="Краткое напоминание для учеников"
          />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={create.isPending}>
          Отправить напоминание
        </Button>
      </Form>

      <Typography.Title level={5}>История</Typography.Title>
      <List
        loading={list.isLoading}
        dataSource={list.data ?? []}
        locale={{ emptyText: 'Пока нет напоминаний' }}
        renderItem={(r) => (
          <List.Item
            actions={[
              <Popconfirm
                key="del"
                title="Удалить напоминание?"
                okText="Удалить"
                cancelText="Отмена"
                okButtonProps={{ danger: true }}
                onConfirm={() => remove.mutate(r.id)}
              >
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  loading={remove.isPending}
                />
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={r.title}
              description={
                <>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {new Date(r.createdAt).toLocaleString('ru-RU')}
                  </Typography.Text>
                </>
              }
            />
          </List.Item>
        )}
      />
    </div>
  );
}
