import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Table, message } from 'antd';
import { api } from '../../shared/api/client';

export function AssignCurators({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () =>
      api<Array<{ id: string; email?: string; globalRole: string }>>('/admin/users'),
  });

  const assign = useMutation({
    mutationFn: (userId: string) =>
      api(`/courses/${courseId}/curators`, {
        method: 'POST',
        json: { userId },
      }),
    onSuccess: () => {
      message.success('Куратор назначен');
      qc.invalidateQueries({ queryKey: ['course', courseId] });
    },
  });

  return (
    <div>
      <Form
        layout="inline"
        style={{ marginBottom: 16 }}
        onFinish={async (v) => {
          try {
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
        dataSource={users.data ?? []}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          { title: 'Роль', dataIndex: 'globalRole' },
          { title: 'ID', dataIndex: 'id' },
          {
            title: '',
            render: (_, r) => (
              <Button size="small" onClick={() => assign.mutate(r.id)}>
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
