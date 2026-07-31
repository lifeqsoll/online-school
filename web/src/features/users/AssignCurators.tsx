import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Popconfirm, Space, Table, Tag, message } from 'antd';
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
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () =>
      api<Array<{ id: string; email?: string; globalRole: string; firstName?: string }>>(
        '/admin/users',
      ),
  });
  return (
    <Table
      rowKey="id"
      loading={users.isLoading}
      dataSource={users.data ?? []}
      columns={[
        { title: 'Email', dataIndex: 'email' },
        { title: 'Имя', dataIndex: 'firstName' },
        { title: 'Роль', dataIndex: 'globalRole' },
        { title: 'ID', dataIndex: 'id' },
      ]}
    />
  );
}
