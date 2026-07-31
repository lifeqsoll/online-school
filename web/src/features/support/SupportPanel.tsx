import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Empty,
  Form,
  Input,
  List,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { api, ApiError } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthContext';

export type SupportThread = {
  id: string;
  channel: 'COURSE' | 'TECH';
  courseId?: string | null;
  course?: { id: string; title: string } | null;
  subject: string;
  status: 'OPEN' | 'CLOSED';
  lastMessageAt: string;
  preview?: string | null;
  isMine?: boolean;
  createdBy?: {
    id: string;
    firstName?: string | null;
    nickname?: string | null;
    email?: string | null;
  };
  messages?: Array<{
    id: string;
    body: string;
    createdAt: string;
    mine: boolean;
    sender?: {
      firstName?: string | null;
      nickname?: string | null;
      email?: string | null;
      globalRole?: string;
    };
  }>;
};

type Mode = 'mine' | 'inbox';
type Channel = 'COURSE' | 'TECH';

function senderLabel(m: NonNullable<SupportThread['messages']>[number]) {
  if (m.mine) return 'Вы';
  if (m.sender?.globalRole === 'ADMIN') return 'Админ';
  if (m.sender?.nickname) return m.sender.nickname;
  if (m.sender?.firstName) return m.sender.firstName;
  if (m.sender?.email) return m.sender.email;
  return 'Сотрудник';
}

export function SupportPanel({
  mode,
  channel,
  title,
  allowCreate = true,
  courseId: lockedCourseId,
}: {
  mode: Mode;
  channel?: Channel;
  title: string;
  allowCreate?: boolean;
  /** When set, only threads for this course; create uses this courseId */
  courseId?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [reply, setReply] = useState('');

  const listKey =
    mode === 'mine'
      ? ['support-mine', channel, lockedCourseId]
      : ['support-inbox', channel, lockedCourseId];

  const list = useQuery({
    queryKey: listKey,
    queryFn: async () => {
      const path =
        mode === 'mine' ? '/support/threads/mine' : '/support/threads/inbox';
      const rows = await api<SupportThread[]>(path);
      let filtered = channel ? rows.filter((t) => t.channel === channel) : rows;
      if (lockedCourseId) {
        filtered = filtered.filter((t) => t.courseId === lockedCourseId);
      }
      return filtered;
    },
  });

  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () =>
      api<Array<{ courseId: string; course: { id: string; title: string } }>>(
        '/me/enrollments',
      ),
    enabled: allowCreate && channel === 'COURSE' && !lockedCourseId,
  });

  const thread = useQuery({
    queryKey: ['support-thread', activeId],
    queryFn: () => api<SupportThread>(`/support/threads/${activeId}`),
    enabled: !!activeId,
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<SupportThread>('/support/threads', { method: 'POST', json: body }),
    onSuccess: (t) => {
      message.success('Обращение отправлено');
      setCreateOpen(false);
      form.resetFields();
      qc.invalidateQueries({ queryKey: ['support-mine'] });
      qc.invalidateQueries({ queryKey: ['support-inbox'] });
      setActiveId(t.id);
    },
  });

  const send = useMutation({
    mutationFn: (body: string) =>
      api(`/support/threads/${activeId}/messages`, {
        method: 'POST',
        json: { body },
      }),
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['support-thread', activeId] });
      qc.invalidateQueries({ queryKey: listKey });
    },
  });

  const close = useMutation({
    mutationFn: () =>
      api(`/support/threads/${activeId}/close`, { method: 'PATCH' }),
    onSuccess: () => {
      message.success('Диалог закрыт');
      qc.invalidateQueries({ queryKey: ['support-thread', activeId] });
      qc.invalidateQueries({ queryKey: listKey });
    },
  });

  const courseOptions = useMemo(
    () =>
      (enrollments.data ?? []).map((e) => ({
        value: e.courseId,
        label: e.course.title,
      })),
    [enrollments.data],
  );

  return (
    <div style={{ width: '100%', maxWidth: 1400 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <Typography.Title level={3} style={{ margin: 0, fontSize: 28 }}>
          {title}
        </Typography.Title>
        {allowCreate ? (
          <Button type="primary" size="large" onClick={() => setCreateOpen(true)}>
            Новое обращение
          </Button>
        ) : null}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: activeId
            ? 'minmax(300px, 400px) minmax(0, 1fr)'
            : '1fr',
          gap: 20,
          minHeight: 'min(72vh, 820px)',
        }}
      >
        <div
          style={{
            background: '#fff',
            border: '1px solid #ebebeb',
            borderRadius: 16,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 'min(72vh, 820px)',
          }}
        >
          {(list.data ?? []).length === 0 ? (
            <div style={{ padding: 32 }}>
              <Empty description="Пока нет обращений" />
            </div>
          ) : (
            <List
              style={{ flex: 1, overflowY: 'auto' }}
              dataSource={list.data}
              renderItem={(t) => (
                <List.Item
                  onClick={() => setActiveId(t.id)}
                  style={{
                    cursor: 'pointer',
                    padding: '16px 20px',
                    background:
                      activeId === t.id ? 'rgba(190,170,242,0.18)' : undefined,
                  }}
                >
                  <List.Item.Meta
                    title={
                      <Space size={8} wrap>
                        <span style={{ fontSize: 16, fontWeight: 600 }}>
                          {t.subject}
                        </span>
                        <Tag color={t.status === 'OPEN' ? 'green' : 'default'}>
                          {t.status === 'OPEN' ? 'Открыт' : 'Закрыт'}
                        </Tag>
                      </Space>
                    }
                    description={
                      <span style={{ fontSize: 14 }}>
                        {t.course?.title ? `${t.course.title} · ` : ''}
                        {dayjs(t.lastMessageAt).format('DD.MM HH:mm')}
                        {t.preview ? ` — ${t.preview}` : ''}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </div>

        {activeId ? (
          <div
            style={{
              background: '#fff',
              border: '1px solid #ebebeb',
              borderRadius: 16,
              padding: 24,
              minHeight: 'min(72vh, 820px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {thread.isLoading ? (
              <Typography.Text type="secondary">Загрузка…</Typography.Text>
            ) : thread.data ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 16,
                    paddingBottom: 14,
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <div>
                    <Typography.Title
                      level={4}
                      style={{ margin: 0, fontSize: 22 }}
                    >
                      {thread.data.subject}
                    </Typography.Title>
                    <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                      {thread.data.course?.title
                        ? `${thread.data.course.title} · `
                        : ''}
                      {thread.data.createdBy?.nickname ||
                        thread.data.createdBy?.firstName ||
                        thread.data.createdBy?.email ||
                        (thread.data.isMine ? user?.email : '')}
                    </Typography.Text>
                  </div>
                  <Space>
                    {thread.data.status === 'OPEN' ? (
                      <Button
                        onClick={() => close.mutate()}
                        loading={close.isPending}
                      >
                        Закрыть
                      </Button>
                    ) : null}
                    <Button onClick={() => setActiveId(null)}>Свернуть</Button>
                  </Space>
                </div>

                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    marginBottom: 16,
                    paddingInline: 4,
                    minHeight: 360,
                  }}
                >
                  {(thread.data.messages ?? []).map((m) => (
                    <div
                      key={m.id}
                      style={{
                        alignSelf: m.mine ? 'flex-end' : 'flex-start',
                        maxWidth: 'min(720px, 78%)',
                        background: m.mine
                          ? 'rgba(190,170,242,0.25)'
                          : '#f5f5f5',
                        borderRadius: 16,
                        padding: '12px 16px',
                      }}
                    >
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 13, display: 'block', marginBottom: 4 }}
                      >
                        {senderLabel(m)} ·{' '}
                        {dayjs(m.createdAt).format('DD.MM HH:mm')}
                      </Typography.Text>
                      <Typography.Text
                        style={{ whiteSpace: 'pre-wrap', fontSize: 16, lineHeight: 1.5 }}
                      >
                        {m.body}
                      </Typography.Text>
                    </div>
                  ))}
                </div>

                {thread.data.status === 'OPEN' ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      gap: 10,
                    }}
                  >
                    <Input.TextArea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      autoSize={{ minRows: 2, maxRows: 6 }}
                      style={{ fontSize: 16, flex: 1 }}
                      placeholder="Ответ… (Enter — отправить, Shift+Enter — новая строка)"
                      onKeyDown={async (e) => {
                        if (e.key !== 'Enter' || e.shiftKey) return;
                        e.preventDefault();
                        if (!reply.trim() || send.isPending) return;
                        try {
                          await send.mutateAsync(reply.trim());
                        } catch (err) {
                          message.error(
                            err instanceof ApiError || err instanceof Error
                              ? err.message
                              : 'Ошибка',
                          );
                        }
                      }}
                    />
                    <Button
                      type="primary"
                      loading={send.isPending}
                      style={{
                        height: 'auto',
                        alignSelf: 'stretch',
                        paddingInline: 22,
                        flexShrink: 0,
                      }}
                      onClick={async () => {
                        if (!reply.trim()) return;
                        try {
                          await send.mutateAsync(reply.trim());
                        } catch (e) {
                          message.error(
                            e instanceof ApiError || e instanceof Error
                              ? e.message
                              : 'Ошибка',
                          );
                        }
                      }}
                    >
                      Отправить
                    </Button>
                  </div>
                ) : (
                  <Typography.Text type="secondary" style={{ fontSize: 15 }}>
                    Диалог закрыт
                  </Typography.Text>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <Modal
        open={createOpen}
        title="Новое обращение"
        onCancel={() => setCreateOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            try {
              await create.mutateAsync({
                channel: channel ?? v.channel,
                courseId:
                  channel === 'COURSE'
                    ? lockedCourseId || v.courseId
                    : undefined,
                subject: v.subject,
                body: v.body,
              });
            } catch (e) {
              message.error(
                e instanceof ApiError || e instanceof Error
                  ? e.message
                  : 'Ошибка',
              );
            }
          }}
        >
          {channel === 'COURSE' && !lockedCourseId ? (
            <Form.Item
              name="courseId"
              label="Курс"
              rules={[{ required: true, message: 'Выберите курс' }]}
            >
              <Select
                options={courseOptions}
                placeholder="Курс, по которому вопрос"
              />
            </Form.Item>
          ) : null}
          <Form.Item
            name="subject"
            label="Тема"
            rules={[{ required: true, message: 'Укажите тему' }]}
          >
            <Input maxLength={200} />
          </Form.Item>
          <Form.Item
            name="body"
            label="Сообщение"
            rules={[{ required: true, message: 'Напишите сообщение' }]}
          >
            <Input.TextArea rows={4} maxLength={4000} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={create.isPending}>
            Отправить
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
