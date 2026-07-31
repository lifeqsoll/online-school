import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Space,
  Table,
  Tag,
  Typography,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Upload,
  message,
} from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../../shared/api/client';
import {
  CourseCoverControls,
  uploadCourseCover,
} from '../../shared/courses/CourseCoverControls';

type Course = {
  id: string;
  title: string;
  slug: string;
  priceCents: number;
  isPublished: boolean;
  coverUrl?: string | null;
};

export function CoursesPage({
  base,
  managedOnly,
}: {
  base: '/admin' | '/curator';
  managedOnly?: boolean;
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [coverFor, setCoverFor] = useState<Course | null>(null);
  const [pendingCover, setPendingCover] = useState<File | null>(null);
  const q = useQuery({
    queryKey: ['courses', managedOnly ? 'managed' : 'all'],
    queryFn: () =>
      api<Course[]>(managedOnly ? '/courses?managedOnly=true' : '/courses'),
  });

  const refresh = async () => {
    await q.refetch();
    qc.invalidateQueries({ queryKey: ['courses'] });
  };

  const removeCourse = (id: string, title: string) => {
    Modal.confirm({
      title: 'Удалить курс?',
      content: `«${title}» и все связанные модули, уроки, ДЗ и файлы будут удалены безвозвратно.`,
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await api(`/courses/${id}`, { method: 'DELETE' });
          message.success('Курс удалён');
          await refresh();
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Ошибка');
        }
      },
    });
  };

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          {managedOnly ? 'Мои курсы' : 'Все курсы'}
        </Typography.Title>
        {!managedOnly && (
          <Button type="primary" onClick={() => setOpen(true)}>
            Создать курс
          </Button>
        )}
      </Space>
      <Table
        rowKey="id"
        loading={q.isLoading}
        dataSource={q.data ?? []}
        columns={[
          {
            title: 'Название',
            dataIndex: 'title',
            render: (title: string, r: Course) => (
              <Space>
                {r.coverUrl ? (
                  <span
                    style={{
                      width: 40,
                      height: 28,
                      borderRadius: 6,
                      display: 'inline-block',
                      background: `#ddd url(${r.coverUrl}) center/cover`,
                      border: '1px solid #eee',
                    }}
                  />
                ) : null}
                {title}
              </Space>
            ),
          },
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
              <Space wrap>
                <Button type="link" onClick={() => nav(`${base}/courses/${r.id}`)}>
                  Открыть
                </Button>
                <Button type="link" onClick={() => setCoverFor(r)}>
                  Обложка
                </Button>
                <Button
                  type="link"
                  danger
                  onClick={() => removeCourse(r.id, r.title)}
                >
                  Удалить
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="Новый курс"
        open={open}
        onCancel={() => {
          setOpen(false);
          setPendingCover(null);
        }}
        footer={null}
        destroyOnClose
      >
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
              if (pendingCover) {
                try {
                  await uploadCourseCover(c.id, pendingCover);
                } catch {
                  message.warning('Курс создан, но обложку загрузить не удалось');
                }
              }
              message.success('Курс создан');
              setOpen(false);
              setPendingCover(null);
              await refresh();
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
          <Form.Item label="Обложка (необязательно)">
            <Upload
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              maxCount={1}
              beforeUpload={(file) => {
                setPendingCover(file);
                return false;
              }}
              onRemove={() => setPendingCover(null)}
            >
              <Button>Выбрать фото</Button>
            </Upload>
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

      <Modal
        title={`Обложка · ${coverFor?.title ?? ''}`}
        open={!!coverFor}
        onCancel={() => setCoverFor(null)}
        footer={null}
        destroyOnClose
      >
        {coverFor ? (
          <CourseCoverControls
            courseId={coverFor.id}
            coverUrl={coverFor.coverUrl}
            onChanged={async () => {
              await refresh();
              const rows = await api<Course[]>(
                managedOnly ? '/courses?managedOnly=true' : '/courses',
              );
              const updated = rows.find((c) => c.id === coverFor.id);
              if (updated) setCoverFor(updated);
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}

export function CourseLink({ id, base }: { id: string; base: string }) {
  return <Link to={`${base}/courses/${id}`}>{id}</Link>;
}
