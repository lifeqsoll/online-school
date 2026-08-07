import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Popconfirm, Select, Space, Table, Tag, message } from 'antd';
import { useMemo, useState } from 'react';
import { api } from '../../shared/api/client';

export function AssignCurators({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () =>
      api<Array<{ id: string; email?: string; globalRole: string }>>('/admin/users'),
  });

  const curators = useQuery({
    queryKey: ['course-curators', courseId],
    queryFn: () =>
      api<Array<{ userId: string }>>(`/courses/${courseId}/curators`),
  });

  const curatorIds = new Set((curators.data ?? []).map((c) => c.userId));

  const assign = useMutation({
    mutationFn: (userId: string) =>
      api(`/courses/${courseId}/curators`, {
        method: 'POST',
        json: { userId },
      }),
    onSuccess: () => {
      message.success('Куратор назначен');
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['course-curators', courseId] });
    },
  });

  const remove = useMutation({
    mutationFn: (userId: string) =>
      api(`/courses/${courseId}/curators/${userId}`, { method: 'DELETE' }),
    onSuccess: () => {
      message.success('Куратор снят с курса');
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      qc.invalidateQueries({ queryKey: ['course-curators', courseId] });
    },
  });

  return (
    <div>
      <Form
        layout="inline"
        style={{ marginBottom: 16 }}
        onFinish={async (v) => {
          try {
            if (curatorIds.has(v.userId)) {
              message.info('Этот пользователь уже куратор курса');
              return;
            }
            await assign.mutateAsync(v.userId);
          } catch (e) {
            message.error(e instanceof Error ? e.message : 'Ошибка');
          }
        }}
      >
        <Form.Item name="userId" rules={[{ required: true }]}>
          <Input placeholder="User ID куратора" style={{ width: 280 }} />
        </Form.Item>
        <Button type="primary" htmlType="submit">
          Назначить куратором
        </Button>
      </Form>
      <Table
        rowKey="id"
        loading={users.isLoading || curators.isLoading}
        dataSource={users.data ?? []}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          { title: 'Роль', dataIndex: 'globalRole' },
          { title: 'ID', dataIndex: 'id' },
          {
            title: '',
            width: 280,
            render: (_, r) =>
              curatorIds.has(r.id) ? (
                <Space>
                  <Tag color="purple">Куратор курса</Tag>
                  <Popconfirm
                    title="Снять куратора с курса?"
                    okText="Снять"
                    cancelText="Отмена"
                    onConfirm={() => remove.mutate(r.id)}
                  >
                    <Button size="small" danger loading={remove.isPending}>
                      Снять
                    </Button>
                  </Popconfirm>
                </Space>
              ) : (
                <Button
                  size="small"
                  loading={assign.isPending}
                  onClick={() => assign.mutate(r.id)}
                >
                  Сделать куратором курса
                </Button>
              ),
          },
        ]}
      />
    </div>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () =>
      api<
        Array<{
          id: string;
          email?: string;
          globalRole: string;
          firstName?: string | null;
          lastName?: string | null;
          nickname?: string | null;
        }>
      >('/admin/users'),
  });

  const setRole = useMutation({
    mutationFn: (v: { id: string; globalRole: string }) =>
      api(`/admin/users/${v.id}/role`, {
        method: 'PATCH',
        json: { globalRole: v.globalRole },
      }),
    onSuccess: () => {
      message.success('Роль обновлена');
      qc.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const filtered = useMemo(() => {
    const rows = users.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((u) => {
      const hay = [
        u.email,
        u.firstName,
        u.lastName,
        u.nickname,
        u.globalRole,
        u.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [users.data, q]);

  return (
    <div>
      <Input.Search
        allowClear
        placeholder="Поиск: email, имя, ник, роль…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ maxWidth: 420, marginBottom: 16 }}
      />
      <Table
        rowKey="id"
        loading={users.isLoading}
        dataSource={filtered}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          {
            title: 'Имя',
            render: (_, r) =>
              [r.firstName, r.lastName].filter(Boolean).join(' ') ||
              r.nickname ||
              '—',
          },
          {
            title: 'Ник',
            dataIndex: 'nickname',
            render: (v: string | null | undefined) => v || '—',
          },
          {
            title: 'Роль',
            dataIndex: 'globalRole',
            width: 180,
            render: (role: string, r) => (
              <Select
                value={role}
                style={{ width: 150 }}
                options={[
                  { value: 'STUDENT', label: 'STUDENT' },
                  { value: 'SUPPORT', label: 'SUPPORT' },
                  { value: 'ADMIN', label: 'ADMIN' },
                ]}
                onChange={(globalRole) =>
                  setRole.mutate({ id: r.id, globalRole })
                }
              />
            ),
          },
          { title: 'ID', dataIndex: 'id' },
        ]}
      />
    </div>
  );
}
