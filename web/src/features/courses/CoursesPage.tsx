import { useQuery } from '@tanstack/react-query';
import { Button, Space, Table, Tag, Typography, Modal, Form, Input, InputNumber, Switch, message } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../../shared/api/client';

type Course = {
  id: string;
  title: string;
  slug: string;
  priceCents: number;
  isPublished: boolean;
};

export function CoursesPage({ base }: { base: '/admin' | '/curator' }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['courses'],
    queryFn: () => api<Course[]>('/courses'),
  });

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Курсы
        </Typography.Title>
        <Button type="primary" onClick={() => setOpen(true)}>
          Создать курс
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={q.isLoading}
        dataSource={q.data ?? []}
        columns={[
          { title: 'Название', dataIndex: 'title' },
          {
            title: 'Цена',
            dataIndex: 'priceCents',
            render: (v: number) => (v === 0 ? 'Бесплатно' : `${(v / 100).toFixed(0)} ₽`),
          },
          {
            title: 'Статус',
            dataIndex: 'isPublished',
            render: (v: boolean) =>
              v ? <Tag color="green">Опубликован</Tag> : <Tag>Черновик</Tag>,
          },
          {
            title: '',
            render: (_, r) => (
              <Button type="link" onClick={() => nav(`${base}/courses/${r.id}`)}>
                Открыть
              </Button>
            ),
          },
        ]}
      />

      <Modal title="Новый курс" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnClose>
        <Form
          layout="vertical"
          onFinish={async (v) => {
            try {
              const c = await api<Course>('/courses', {
                method: 'POST',
                json: {
                  title: v.title,
                  description: v.description,
                  priceCents: v.priceCents ?? 0,
                  isPublished: !!v.isPublished,
                },
              });
              message.success('Курс создан');
              setOpen(false);
              await q.refetch();
              nav(`${base}/courses/${c.id}`);
            } catch (e) {
              message.error(e instanceof Error ? e.message : 'Ошибка');
            }
          }}
        >
          <Form.Item name="title" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="priceCents" label="Цена (копейки, 0 = бесплатно)" initialValue={0}>
            <InputNumber className="w-full" min={0} />
          </Form.Item>
          <Form.Item name="isPublished" label="Опубликован" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Создать
          </Button>
        </Form>
      </Modal>
    </div>
  );
}

export function CourseLink({ id, base }: { id: string; base: string }) {
  return <Link to={`${base}/courses/${id}`}>{id}</Link>;
}
