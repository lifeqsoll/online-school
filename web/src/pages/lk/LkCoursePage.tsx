import { useQuery } from '@tanstack/react-query';
import { List, Tabs, Typography } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../shared/api/client';

type CourseDetail = {
  id: string;
  title: string;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{ id: string; title: string; content?: string | null }>;
  }>;
};

type Assignment = { id: string; title: string; maxXp: number };

export function LkCoursePage() {
  const { courseId = '' } = useParams();

  const course = useQuery({
    queryKey: ['lk-course', courseId],
    queryFn: () => api<CourseDetail>(`/courses/${courseId}`),
    enabled: !!courseId,
  });

  const assignments = useQuery({
    queryKey: ['assignments', courseId],
    queryFn: () => api<Assignment[]>(`/courses/${courseId}/assignments`),
    enabled: !!courseId,
  });

  if (!course.data) return <Typography.Text>Загрузка…</Typography.Text>;

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {course.data.title}
      </Typography.Title>
      <Tabs
        items={[
          {
            key: 'lessons',
            label: 'Уроки',
            children: (
              <div>
                {course.data.modules.map((m) => (
                  <div key={m.id} style={{ marginBottom: 16 }}>
                    <Typography.Title level={5}>{m.title}</Typography.Title>
                    <List
                      size="small"
                      dataSource={m.lessons}
                      renderItem={(l) => (
                        <List.Item>
                          <Link to={`/lk/lessons/${l.id}`}>{l.title}</Link>
                        </List.Item>
                      )}
                    />
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: 'hw',
            label: 'ДЗ',
            children: (
              <List
                dataSource={assignments.data ?? []}
                locale={{ emptyText: 'Нет опубликованных заданий' }}
                renderItem={(a) => (
                  <List.Item>
                    {a.title}{' '}
                    <Typography.Text type="secondary">· {a.maxXp} XP</Typography.Text>
                  </List.Item>
                )}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
