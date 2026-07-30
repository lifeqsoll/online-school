import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Table, message } from 'antd';
import { useState } from 'react';
import { api } from '../../shared/api/client';

export function CourseStudents({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // No dedicated course enrollment list — show grant UI + tip
  const me = useQuery({
    queryKey: ['my-enrollments'],
    queryFn: () => api<Array<{ id: string; courseId: string; userId: string }>>('/me/enrollments'),
  });

  const grant = useMutation({
    mutationFn: (userId: string) =>
      api(`/courses/${courseId}/grants`, {
        method: 'POST',
        json: { userId },
      }),
    onSuccess: () => {
      message.success('Доступ выдан');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['my-enrollments'] });
    },
  });

  return (
    <div>
      <Button type="primary" onClick={() => setOpen(true)} style={{ marginBottom: 12 }}>
        Выдать доступ (grant)
      </Button>
      <Table
        rowKey="id"
        dataSource={(me.data ?? []).filter((e) => e.courseId === courseId)}
        columns={[
          { title: 'Enrollment', dataIndex: 'id' },
          { title: 'User', dataIndex: 'userId' },
        ]}
        locale={{ emptyText: 'Список enrolled учеников курса — через grant / admin users' }}
      />
      <Modal title="Grant enroll" open={open} onCancel={() => setOpen(false)} footer={null}>
        <Form
          layout="vertical"
          onFinish={async (v) => {
            try {
              await grant.mutateAsync(v.userId);
            } catch (e) {
              message.error(e instanceof Error ? e.message : 'Ошибка');
            }
          }}
        >
          <Form.Item name="userId" label="User ID" rules={[{ required: true }]}>
            <Input placeholder="cuid пользователя" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={grant.isPending}>
            Выдать
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
