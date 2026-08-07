import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Rate,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthContext';

export type SupportThread = {
  id: string;
  channel: 'COURSE' | 'TECH';
  topic?: string;
  topicLabel?: string;
  courseId?: string | null;
  course?: { id: string; title: string } | null;
  subject: string;
  status: 'OPEN' | 'CLOSED';
  lastMessageAt: string;
  preview?: string | null;
  isMine?: boolean;
  canRate?: boolean;
  canCancelCourse?: boolean;
  enrollmentActive?: boolean;
  myRating?: { score: number; comment?: string | null } | null;
  firstMessageId?: string | null;
  createdBy?: {
    id: string;
    firstName?: string | null;
    nickname?: string | null;
    email?: string | null;
  };
  lastAgent?: {
    id: string;
    firstName?: string | null;
    nickname?: string | null;
    email?: string | null;
    globalRole?: string;
  } | null;
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
    attachments?: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      url: string;
    }>;
  }>;
};

type Mode = 'mine' | 'inbox';
type Channel = 'COURSE' | 'TECH';

const COURSE_TOPICS = [
  { value: 'LESSON_QUESTION', label: 'Вопрос по уроку / материалу' },
  { value: 'HOMEWORK', label: 'Домашнее задание / проверка' },
  { value: 'SCHEDULE_LIVE', label: 'Расписание / LIVE' },
  { value: 'CONTENT_ACCESS', label: 'Доступ к уроку / контенту' },
  { value: 'PROGRESS_XP', label: 'Прогресс / XP / рейтинг' },
  { value: 'COURSE_CANCEL', label: 'Отмена курса / возврат' },
  { value: 'OTHER_COURSE', label: 'Другое' },
];

const TECH_TOPICS = [
  { value: 'AUTH_ACCOUNT', label: 'Вход / пароль / аккаунт' },
  { value: 'PAYMENT_ACCESS', label: 'Оплата / доступ после покупки' },
  { value: 'SITE_BUG', label: 'Ошибка сайта / баг' },
  { value: 'MEDIA_FILES', label: 'Видео / файлы не открываются' },
  { value: 'NOTIFICATIONS_EMAIL', label: 'Уведомления / почта' },
  { value: 'OTHER_TECH', label: 'Другое' },
];

function senderLabel(m: NonNullable<SupportThread['messages']>[number]) {
  if (m.mine) return 'Вы';
  if (m.sender?.globalRole === 'ADMIN') return 'Админ';
  if (m.sender?.globalRole === 'SUPPORT') return 'Поддержка';
  if (m.sender?.nickname) return m.sender.nickname;
  if (m.sender?.firstName) return m.sender.firstName;
  if (m.sender?.email) return m.sender.email;
  return 'Сотрудник';
}

function initials(label: string) {
  const t = label.trim();
  if (!t) return '?';
  return t.slice(0, 1).toUpperCase();
}

function isStaffSender(m: NonNullable<SupportThread['messages']>[number]) {
  const role = m.sender?.globalRole;
  return role === 'ADMIN' || role === 'SUPPORT' || (!m.mine && !!role);
}

async function uploadSupportFile(messageId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('ownerType', 'SUPPORT_MESSAGE');
  fd.append('ownerId', messageId);
  await api('/files', { method: 'POST', body: fd });
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
  courseId?: string;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [reply, setReply] = useState('');
  const [createFiles, setCreateFiles] = useState<UploadFile[]>([]);
  const [replyFiles, setReplyFiles] = useState<UploadFile[]>([]);
  const [rateScore, setRateScore] = useState(5);
  const [rateComment, setRateComment] = useState('');
  const topicWatch = Form.useWatch('topic', form);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);

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

  const msgCount = thread.data?.messages?.length ?? 0;
  useEffect(() => {
    if (!activeId || !msgCount) return;
    const grew = msgCount > prevMsgCount.current;
    const firstPaint = prevMsgCount.current === 0;
    prevMsgCount.current = msgCount;
    if (!grew && !firstPaint) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: grew && !firstPaint ? 'smooth' : 'auto',
      block: 'end',
    });
  }, [activeId, msgCount, thread.dataUpdatedAt]);

  useEffect(() => {
    prevMsgCount.current = 0;
  }, [activeId]);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const t = await api<SupportThread>('/support/threads', {
        method: 'POST',
        json: body,
      });
      const msgId = t.firstMessageId;
      if (msgId && createFiles.length) {
        for (const f of createFiles) {
          if (f.originFileObj) {
            await uploadSupportFile(msgId, f.originFileObj as File);
          }
        }
      }
      return t;
    },
    onSuccess: (t) => {
      message.success('Обращение отправлено');
      setCreateOpen(false);
      form.resetFields();
      setCreateFiles([]);
      qc.invalidateQueries({ queryKey: ['support-mine'] });
      qc.invalidateQueries({ queryKey: ['support-inbox'] });
      setActiveId(t.id);
    },
  });

  const send = useMutation({
    mutationFn: async (body: string) => {
      const t = await api<SupportThread>(`/support/threads/${activeId}/messages`, {
        method: 'POST',
        json: { body },
      });
      const last = [...(t.messages ?? [])].reverse().find((m) => m.mine);
      if (last && replyFiles.length) {
        for (const f of replyFiles) {
          if (f.originFileObj) {
            await uploadSupportFile(last.id, f.originFileObj as File);
          }
        }
      }
      return t;
    },
    onSuccess: async () => {
      setReply('');
      setReplyFiles([]);
      await qc.invalidateQueries({ queryKey: ['support-thread', activeId] });
      await qc.invalidateQueries({ queryKey: listKey });
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

  const rate = useMutation({
    mutationFn: () =>
      api(`/support/threads/${activeId}/rating`, {
        method: 'POST',
        json: {
          score: rateScore,
          comment: rateComment.trim() || undefined,
        },
      }),
    onSuccess: () => {
      message.success('Спасибо за оценку');
      setRateComment('');
      qc.invalidateQueries({ queryKey: ['support-thread', activeId] });
      qc.invalidateQueries({ queryKey: listKey });
    },
  });

  const cancelCourse = useMutation({
    mutationFn: () =>
      api<{
        refundEligible: boolean;
        refundStatus: string;
      }>(`/support/threads/${activeId}/cancel-course`, {
        method: 'POST',
        json: {},
      }),
    onSuccess: (r) => {
      message.success(
        r.refundEligible
          ? 'Курс отменён. Возврат возможен (окно 5 дней) — автовыплата пока не выполняется.'
          : 'Курс отменён. Вне окна возврата 5 дней.',
      );
      qc.invalidateQueries({ queryKey: ['support-thread', activeId] });
      qc.invalidateQueries({ queryKey: listKey });
      qc.invalidateQueries({ queryKey: ['me-enrollments'] });
    },
    onError: (e: Error) =>
      message.error(e instanceof ApiError ? e.message : e.message || 'Ошибка'),
  });

  const courseOptions = useMemo(
    () =>
      (enrollments.data ?? []).map((e) => ({
        value: e.courseId,
        label: e.course.title,
      })),
    [enrollments.data],
  );

  const topicOptions = channel === 'TECH' ? TECH_TOPICS : COURSE_TOPICS;
  const isOther =
    topicWatch === 'OTHER_COURSE' || topicWatch === 'OTHER_TECH';

  const messages = thread.data?.messages ?? [];

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
            ? 'minmax(280px, 360px) minmax(0, 1fr)'
            : '1fr',
          gap: 16,
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
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {(list.data ?? []).map((t) => {
                const active = activeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveId(t.id)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: '14px 16px 14px 14px',
                      border: 'none',
                      borderBottom: '1px solid #f0f0f0',
                      borderLeft: active
                        ? '3px solid #6b4fb8'
                        : '3px solid transparent',
                      background: active
                        ? 'rgba(190,170,242,0.16)'
                        : 'transparent',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 8,
                        alignItems: 'flex-start',
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: '#1f1f1f',
                          lineHeight: 1.35,
                        }}
                      >
                        {t.subject}
                      </span>
                      <Tag
                        color={t.status === 'OPEN' ? 'green' : 'default'}
                        style={{ marginInlineEnd: 0, flexShrink: 0 }}
                      >
                        {t.status === 'OPEN' ? 'Открыт' : 'Закрыт'}
                      </Tag>
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        color: '#8c8c8c',
                        lineHeight: 1.4,
                      }}
                    >
                      {t.topicLabel ? `${t.topicLabel} · ` : ''}
                      {t.course?.title ? `${t.course.title} · ` : ''}
                      {t.lastAgent
                        ? `${
                            t.lastAgent.nickname ||
                            t.lastAgent.firstName ||
                            'агент'
                          } · `
                        : ''}
                      {dayjs(t.lastMessageAt).format('DD.MM HH:mm')}
                    </div>
                    {t.preview ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          color: '#595959',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.preview}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {activeId ? (
          <div
            key={activeId}
            style={{
              background: '#fff',
              border: '1px solid #ebebeb',
              borderRadius: 16,
              minHeight: 'min(72vh, 820px)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
              {thread.isLoading ? (
                <div style={{ padding: 24 }}>
                  <Typography.Text type="secondary">Загрузка…</Typography.Text>
                </div>
              ) : thread.data ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '16px 20px',
                      borderBottom: '1px solid #f0f0f0',
                      background: '#fafafa',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Typography.Title
                        level={4}
                        style={{ margin: 0, fontSize: 20 }}
                      >
                        {thread.data.subject}
                      </Typography.Title>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 13 }}
                      >
                        {thread.data.topicLabel
                          ? `${thread.data.topicLabel} · `
                          : ''}
                        {thread.data.course?.title
                          ? `${thread.data.course.title} · `
                          : ''}
                        {thread.data.createdBy?.nickname ||
                          thread.data.createdBy?.firstName ||
                          thread.data.createdBy?.email ||
                          (thread.data.isMine ? user?.email : '')}
                      </Typography.Text>
                    </div>
                    <Space wrap>
                      {thread.data.canCancelCourse ? (
                        <Popconfirm
                          title="Отменить курс ученику?"
                          description="Доступ сразу закроется. Возврат — если запись ≤ 5 дней (без автовыплаты)."
                          okText="Отменить курс"
                          cancelText="Назад"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => cancelCourse.mutate()}
                        >
                          <Button danger loading={cancelCourse.isPending}>
                            Отменить курс
                          </Button>
                        </Popconfirm>
                      ) : null}
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
                      gap: 12,
                      padding: '16px 20px',
                      minHeight: 280,
                    }}
                  >
                    {messages.map((m) => {
                      const label = senderLabel(m);
                      const staff = isStaffSender(m);
                      return (
                        <div
                          key={m.id}
                          style={{
                            alignSelf: m.mine ? 'flex-end' : 'flex-start',
                            maxWidth: 'min(680px, 82%)',
                            display: 'flex',
                            gap: 10,
                            flexDirection: m.mine ? 'row-reverse' : 'row',
                          }}
                        >
                          <div
                            aria-hidden
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 700,
                              color: '#fff',
                              background: m.mine
                                ? '#6b4fb8'
                                : staff
                                  ? '#5b7c99'
                                  : '#a3a3a3',
                              marginTop: 2,
                            }}
                          >
                            {initials(label)}
                          </div>
                          <div
                            style={{
                              background: m.mine
                                ? 'rgba(190,170,242,0.28)'
                                : staff
                                  ? '#eef3f8'
                                  : '#f5f5f5',
                              border: staff
                                ? '1px solid #d9e4ef'
                                : '1px solid transparent',
                              borderRadius: m.mine
                                ? '16px 16px 4px 16px'
                                : '16px 16px 16px 4px',
                              padding: '10px 14px',
                              minWidth: 0,
                            }}
                          >
                            <Typography.Text
                              type="secondary"
                              style={{
                                fontSize: 12,
                                display: 'block',
                                marginBottom: 4,
                              }}
                            >
                              {label} ·{' '}
                              {dayjs(m.createdAt).format('DD.MM HH:mm')}
                            </Typography.Text>
                            <Typography.Text
                              style={{
                                whiteSpace: 'pre-wrap',
                                fontSize: 15,
                                lineHeight: 1.5,
                              }}
                            >
                              {m.body}
                            </Typography.Text>
                            {m.attachments?.length ? (
                              <div
                                style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: 8,
                                  marginTop: 8,
                                }}
                              >
                                {m.attachments.map((a) =>
                                  a.mimeType.startsWith('image/') ? (
                                    <a
                                      key={a.id}
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <img
                                        src={a.url}
                                        alt={a.originalName}
                                        style={{
                                          width: 72,
                                          height: 72,
                                          objectFit: 'cover',
                                          borderRadius: 8,
                                        }}
                                      />
                                    </a>
                                  ) : (
                                    <a
                                      key={a.id}
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{ fontSize: 13 }}
                                    >
                                      {a.originalName}
                                    </a>
                                  ),
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {thread.data.status === 'OPEN' ? (
                    <div
                      style={{
                        borderTop: '1px solid #f0f0f0',
                        padding: '12px 16px 16px',
                        background: '#fff',
                        position: 'sticky',
                        bottom: 0,
                      }}
                    >
                      <Upload
                        multiple
                        fileList={replyFiles}
                        beforeUpload={() => false}
                        onChange={({ fileList }) =>
                          setReplyFiles(fileList.slice(0, 5))
                        }
                        style={{ marginBottom: 8 }}
                      >
                        <Button size="small">Вложение</Button>
                      </Upload>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'stretch',
                          gap: 10,
                          marginTop: 8,
                        }}
                      >
                        <Input.TextArea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          autoSize={{ minRows: 2, maxRows: 6 }}
                          style={{ fontSize: 15, flex: 1, borderRadius: 12 }}
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
                            borderRadius: 12,
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
                    </div>
                  ) : (
                    <div style={{ padding: '12px 20px 20px' }}>
                      <Typography.Text type="secondary" style={{ fontSize: 15 }}>
                        Диалог закрыт
                      </Typography.Text>
                      {thread.data.canRate ? (
                        <div
                          style={{
                            marginTop: 16,
                            padding: 16,
                            borderRadius: 12,
                            background: '#fafafa',
                            border: '1px solid #f0f0f0',
                          }}
                        >
                          <Typography.Text strong>
                            Оцените работу сотрудника (необязательно)
                          </Typography.Text>
                          <div style={{ margin: '8px 0' }}>
                            <Rate value={rateScore} onChange={setRateScore} />
                          </div>
                          <Input.TextArea
                            rows={2}
                            maxLength={1000}
                            value={rateComment}
                            onChange={(e) => setRateComment(e.target.value)}
                            placeholder="Комментарий"
                            style={{ marginBottom: 8 }}
                          />
                          <Space>
                            <Button
                              type="primary"
                              loading={rate.isPending}
                              onClick={() => rate.mutate()}
                            >
                              Отправить оценку
                            </Button>
                            <Button
                              type="text"
                              onClick={() =>
                                qc.setQueryData(
                                  ['support-thread', activeId],
                                  (old: SupportThread | undefined) =>
                                    old ? { ...old, canRate: false } : old,
                                )
                              }
                            >
                              Пропустить
                            </Button>
                          </Space>
                        </div>
                      ) : null}
                      {thread.data.myRating ? (
                        <Typography.Paragraph
                          type="secondary"
                          style={{ marginTop: 12 }}
                        >
                          Ваша оценка: {thread.data.myRating.score}/5
                          {thread.data.myRating.comment
                            ? ` — ${thread.data.myRating.comment}`
                            : ''}
                        </Typography.Paragraph>
                      ) : null}
                    </div>
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
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            topic: channel === 'TECH' ? 'AUTH_ACCOUNT' : 'LESSON_QUESTION',
          }}
          onFinish={async (v) => {
            try {
              const topic = v.topic as string;
              const subject =
                topic === 'OTHER_COURSE' || topic === 'OTHER_TECH'
                  ? v.subject
                  : topicOptions.find((t) => t.value === topic)?.label ||
                    v.subject;
              await create.mutateAsync({
                channel: channel ?? v.channel,
                topic,
                courseId:
                  channel === 'COURSE'
                    ? lockedCourseId || v.courseId
                    : undefined,
                subject,
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
            name="topic"
            label="Тема обращения"
            rules={[{ required: true, message: 'Выберите тему' }]}
          >
            <Select options={topicOptions} />
          </Form.Item>
          {isOther ? (
            <Form.Item
              name="subject"
              label="Своя тема"
              rules={[{ required: true, message: 'Укажите тему' }]}
            >
              <Input maxLength={200} />
            </Form.Item>
          ) : null}
          <Form.Item
            name="body"
            label="Сообщение"
            rules={[{ required: true, message: 'Напишите сообщение' }]}
          >
            <Input.TextArea rows={4} maxLength={4000} />
          </Form.Item>
          <Form.Item label="Вложения">
            <Upload
              multiple
              fileList={createFiles}
              beforeUpload={() => false}
              onChange={({ fileList }) => setCreateFiles(fileList.slice(0, 5))}
            >
              <Button>Добавить файлы</Button>
            </Upload>
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            loading={create.isPending}
          >
            Отправить
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
