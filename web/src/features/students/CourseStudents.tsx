import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Table, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { api } from '../../shared/api/client';

type CourseEnrollment = {
  id: string;
  userId: string;
  status: string;
  source: 'FREE' | 'PAYMENT' | 'GRANT';
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    nickname?: string | null;
    email?: string | null;
    isActive: boolean;
  };
};

const SOURCE_LABEL: Record<CourseEnrollment['source'], string> = {
  FREE: 'Бесплатно',
  PAYMENT: 'Оплата',
  GRANT: 'Грант',
};

export function CourseStudents({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const list = useQuery({
    queryKey: ['course-enrollments', courseId],
    queryFn: () =>
      api<CourseEnrollment[]>(`/courses/${courseId}/enrollments`),
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
      qc.invalidateQueries({ queryKey: ['course-enrollments', courseId] });
    },
  });

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <Typography.Text type="secondary">
          Все зачисленные ученики курса. Грантовые выделены отдельно.
        </Typography.Text>
        <Button type="primary" onClick={() => setOpen(true)}>
          Выдать доступ (grant)
        </Button>
      </div>
      <Table
        rowKey="id"
        loading={list.isLoading}
        dataSource={list.data ?? []}
        onRow={(row) =>
          row.source === 'GRANT'
            ? {
                style: {
                  background: '#fff7e6',
                },
              }
            : {}
        }
        columns={[
          {
            title: 'Ученик',
            render: (_, r) => (
              <div>
                <div style={{ fontWeight: 600 }}>{r.user.displayName}</div>
                {r.user.email ? (
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>{r.user.email}</div>
                ) : null}
              </div>
            ),
          },
          {
            title: 'Как попал',
            dataIndex: 'source',
            width: 140,
            render: (source: CourseEnrollment['source']) =>
              source === 'GRANT' ? (
                <Tag color="gold">{SOURCE_LABEL[source]}</Tag>
              ) : (
                <Tag>{SOURCE_LABEL[source] ?? source}</Tag>
              ),
          },
          {
            title: 'Статус',
            dataIndex: 'status',
            width: 120,
          },
          {
            title: 'ID',
            dataIndex: 'userId',
            ellipsis: true,
            width: 200,
          },
        ]}
        locale={{ emptyText: 'Пока нет зачисленных учеников' }}
      />
      <Modal title="Выдать доступ (grant)" open={open} onCancel={() => setOpen(false)} footer={null}>
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
