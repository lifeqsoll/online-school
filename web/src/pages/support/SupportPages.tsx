import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../shared/api/client';
import { fadeUp } from '../../shared/motion';
import { StaffSupportInboxPage } from '../lk/LkSupportPages';

type SearchUser = {
  id: string;
  email?: string;
  firstName?: string | null;
  nickname?: string | null;
  globalRole: string;
};

type StudentCard = {
  user: SearchUser & {
    lastName?: string | null;
    isActive?: boolean;
  };
  enrollments: Array<{
    courseId: string;
    course: { id: string; title: string };
    status: string;
    refundStatus?: string;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    course?: { title: string } | null;
    createdAt: string;
  }>;
  threads: Array<{
    id: string;
    subject: string;
    channel: string;
    status: string;
    lastMessageAt: string;
  }>;
  xp: Array<{
    courseId: string;
    totalXp: number;
    course: { title: string };
  }>;
};

type CourseModule = {
  id: string;
  title: string;
  radarLabel?: string | null;
  lessons: Array<{ id: string; title: string; type: string }>;
};

export function SupportInboxPage() {
  return (
    <StaffSupportInboxPage channel="TECH" title="Техподдержка" />
  );
}

export function SupportUsersPage() {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const nav = useNavigate();

  const search = useQuery({
    queryKey: ['support-user-search', submitted],
    queryFn: () =>
      api<SearchUser[]>(
        `/support/users/search?q=${encodeURIComponent(submitted)}`,
      ),
    enabled: submitted.length >= 2,
  });

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Поиск ученика
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Email, никнейм или ID пользователя
      </Typography.Paragraph>
      <Space.Compact style={{ width: '100%', maxWidth: 480, marginBottom: 16 }}>
        <Input
          placeholder="email@… или ник"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onPressEnter={() => setSubmitted(q.trim())}
        />
        <Button type="primary" onClick={() => setSubmitted(q.trim())}>
          Найти
        </Button>
      </Space.Compact>
      <Table
        rowKey="id"
        loading={search.isFetching}
        dataSource={search.data ?? []}
        pagination={false}
        locale={{ emptyText: submitted ? 'Никого не нашли' : 'Введите запрос' }}
        onRow={(r) => ({
          onClick: () => nav(`/support/users/${r.id}`),
          style: { cursor: 'pointer' },
        })}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          { title: 'Имя', dataIndex: 'firstName' },
          { title: 'Ник', dataIndex: 'nickname' },
          {
            title: 'Роль',
            dataIndex: 'globalRole',
            render: (v: string) => <Tag>{v}</Tag>,
          },
        ]}
      />
    </motion.div>
  );
}

export function SupportStudentPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [courseId, setCourseId] = useState<string | undefined>();
  const [lessonId, setLessonId] = useState<string | undefined>();
  const [moduleId, setModuleId] = useState<string | undefined>();

  const card = useQuery({
    queryKey: ['support-student', id],
    queryFn: () => api<StudentCard>(`/support/users/${id}`),
    enabled: !!id,
  });

  const modules = useQuery({
    queryKey: ['support-course-modules', courseId],
    queryFn: () =>
      api<CourseModule[]>(`/support/courses/${courseId}/modules`),
    enabled: !!courseId,
  });

  const lessons =
    modules.data?.flatMap((m) =>
      m.lessons.map((l) => ({
        ...l,
        moduleTitle: m.title,
      })),
    ) ?? [];

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['support-student', id] });

  const xpMut = useMutation({
    mutationFn: (v: { delta: number; reason?: string }) =>
      api(`/support/users/${id}/courses/${courseId}/xp`, {
        method: 'POST',
        json: v,
      }),
    onSuccess: () => {
      message.success('XP обновлён');
      invalidate();
    },
    onError: (e: Error) => message.error(e.message),
  });

  const grantMut = useMutation({
    mutationFn: () =>
      api(`/support/users/${id}/lessons/${lessonId}/grant`, {
        method: 'POST',
      }),
    onSuccess: () => message.success('Урок открыт'),
    onError: (e: Error) => message.error(e.message),
  });

  const completeMut = useMutation({
    mutationFn: () =>
      api(`/support/users/${id}/lessons/${lessonId}/complete`, {
        method: 'POST',
        json: { completed: true },
      }),
    onSuccess: () => message.success('Прохождение отмечено'),
    onError: (e: Error) => message.error(e.message),
  });

  const attendMut = useMutation({
    mutationFn: () =>
      api(`/support/users/${id}/lessons/${lessonId}/attendance`, {
        method: 'POST',
        json: { completed: true },
      }),
    onSuccess: () => message.success('Посещение отмечено'),
    onError: (e: Error) => message.error(e.message),
  });

  const radarMut = useMutation({
    mutationFn: (v: { delta: number; reason?: string }) =>
      api(`/support/users/${id}/courses/${courseId}/radar-bonus`, {
        method: 'POST',
        json: { moduleId, ...v },
      }),
    onSuccess: () => message.success('Бонус радара добавлен'),
    onError: (e: Error) => message.error(e.message),
  });

  const resetMut = useMutation({
    mutationFn: () =>
      api(`/support/users/${id}/password-reset`, { method: 'POST' }),
    onSuccess: () => message.success('Ссылка сброса пароля отправлена'),
    onError: (e: Error) => message.error(e.message),
  });

  if (!id) return null;
  const u = card.data?.user;

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <Space style={{ marginBottom: 12 }}>
        <Link to="/support/users">← К поиску</Link>
      </Space>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        {u?.nickname || u?.firstName || u?.email || 'Карточка ученика'}
      </Typography.Title>
      {u ? (
        <Typography.Paragraph type="secondary">
          {u.email} · {u.globalRole} · id: {u.id}
        </Typography.Paragraph>
      ) : null}

      <Card loading={card.isLoading} style={{ marginBottom: 16 }} title="Курсы">
        <Table
          rowKey="courseId"
          size="small"
          pagination={false}
          dataSource={card.data?.enrollments ?? []}
          columns={[
            { title: 'Курс', render: (_, r) => r.course.title },
            {
              title: 'Статус',
              dataIndex: 'status',
              render: (v: string) => <Tag>{v}</Tag>,
            },
            { title: 'Возврат', dataIndex: 'refundStatus' },
          ]}
        />
      </Card>

      <Card style={{ marginBottom: 16 }} title="Инструменты">
        <div style={{ maxWidth: 560 }}>
          <Typography.Text type="secondary">Курс</Typography.Text>
          <Select
            style={{ width: '100%', marginBottom: 12, marginTop: 4 }}
            placeholder="Выберите курс"
            value={courseId}
            onChange={(v) => {
              setCourseId(v);
              setLessonId(undefined);
              setModuleId(undefined);
            }}
            options={(card.data?.enrollments ?? []).map((e) => ({
              value: e.courseId,
              label: e.course.title,
            }))}
          />

          <Typography.Text type="secondary">Урок</Typography.Text>
          <Select
            style={{ width: '100%', marginBottom: 12, marginTop: 4 }}
            placeholder="Урок"
            disabled={!courseId}
            value={lessonId}
            onChange={setLessonId}
            options={lessons.map((l) => ({
              value: l.id,
              label: `${l.moduleTitle}: ${l.title}`,
            }))}
          />

          <Space wrap style={{ marginBottom: 16 }}>
            <Button
              disabled={!lessonId}
              loading={grantMut.isPending}
              onClick={() => grantMut.mutate()}
            >
              Открыть урок
            </Button>
            <Button
              disabled={!lessonId}
              loading={completeMut.isPending}
              onClick={() => completeMut.mutate()}
            >
              Отметить прохождение
            </Button>
            <Button
              disabled={!lessonId}
              loading={attendMut.isPending}
              onClick={() => attendMut.mutate()}
            >
              Отметить посещение
            </Button>
          </Space>

          <Form
            layout="inline"
            onFinish={(v) => {
              if (!courseId) {
                message.warning('Выберите курс');
                return;
              }
              xpMut.mutate({ delta: v.delta, reason: v.reason });
            }}
            style={{ marginBottom: 16 }}
          >
            <Form.Item
              name="delta"
              rules={[{ required: true, message: 'Δ XP' }]}
            >
              <InputNumber placeholder="Δ XP" />
            </Form.Item>
            <Form.Item name="reason">
              <Input placeholder="Причина" style={{ width: 180 }} />
            </Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={xpMut.isPending}
              disabled={!courseId}
            >
              XP
            </Button>
          </Form>

          <Typography.Text type="secondary">Модуль (радар)</Typography.Text>
          <Select
            style={{ width: '100%', marginBottom: 12, marginTop: 4 }}
            placeholder="Модуль"
            disabled={!courseId}
            value={moduleId}
            onChange={setModuleId}
            options={(modules.data ?? []).map((m) => ({
              value: m.id,
              label: m.radarLabel || m.title,
            }))}
          />

          <Form
            layout="inline"
            onFinish={(v) => {
              if (!courseId || !moduleId) {
                message.warning('Курс и модуль обязательны');
                return;
              }
              radarMut.mutate({ delta: v.delta, reason: v.reason });
            }}
          >
            <Form.Item
              name="delta"
              rules={[{ required: true, message: 'Δ %' }]}
            >
              <InputNumber placeholder="Δ %" min={-100} max={100} />
            </Form.Item>
            <Form.Item name="reason">
              <Input placeholder="Причина" style={{ width: 180 }} />
            </Form.Item>
            <Button
              htmlType="submit"
              loading={radarMut.isPending}
              disabled={!moduleId}
            >
              Бонус радара
            </Button>
          </Form>

          <div style={{ marginTop: 24 }}>
            <Popconfirm
              title="Отправить письмо со сбросом пароля?"
              onConfirm={() => resetMut.mutate()}
            >
              <Button danger loading={resetMut.isPending}>
                Сброс пароля
              </Button>
            </Popconfirm>
          </div>
        </div>
      </Card>

      <Card title="XP" style={{ marginBottom: 16 }}>
        <Table
          rowKey="courseId"
          size="small"
          pagination={false}
          dataSource={card.data?.xp ?? []}
          columns={[
            { title: 'Курс', render: (_, r) => r.course.title },
            { title: 'XP', dataIndex: 'totalXp' },
          ]}
        />
      </Card>

      <Card title="Платежи" style={{ marginBottom: 16 }}>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={card.data?.payments ?? []}
          columns={[
            {
              title: 'Курс',
              render: (_, r) => r.course?.title ?? '—',
            },
            {
              title: 'Сумма',
              render: (_, r) =>
                `${(r.amountCents / 100).toFixed(0)} ${r.currency}`,
            },
            { title: 'Статус', dataIndex: 'status' },
          ]}
        />
      </Card>

      <Card title="Обращения">
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={card.data?.threads ?? []}
          columns={[
            { title: 'Тема', dataIndex: 'subject' },
            { title: 'Канал', dataIndex: 'channel' },
            { title: 'Статус', dataIndex: 'status' },
          ]}
        />
      </Card>
    </motion.div>
  );
}
