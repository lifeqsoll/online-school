import { useQuery } from '@tanstack/react-query';
import { List, Spin, Typography } from 'antd';
import { useParams } from 'react-router-dom';
import { api, getAccessToken } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthContext';
import { EnrollBuyButton } from '../../features/catalog/EnrollBuyButton';

type CourseDetail = {
  id: string;
  title: string;
  description?: string | null;
  priceCents: number;
  modules: Array<{ id: string; title: string; lessons: Array<{ id: string; title: string }> }>;
};

type Enrollment = { courseId: string };

export function PublicCoursePage() {
  const { idOrSlug = '' } = useParams();
  const { user } = useAuth();

  const course = useQuery({
    queryKey: ['public-course', idOrSlug],
    queryFn: () =>
      api<CourseDetail>(`/courses/${idOrSlug}`, {
        auth: !!getAccessToken(),
      }),
    enabled: !!idOrSlug,
  });

  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Enrollment[]>('/me/enrollments'),
    enabled: !!user,
  });

  if (course.isLoading) return <Spin style={{ margin: 48 }} />;
  if (!course.data) {
    return (
      <Typography.Text type="danger" style={{ display: 'block', padding: 48 }}>
        Курс не найден
      </Typography.Text>
    );
  }

  const c = course.data;
  const enrolled = !!enrollments.data?.some((e) => e.courseId === c.id);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
      <Typography.Title level={2}>{c.title}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {c.description || 'Описание скоро появится'}
      </Typography.Paragraph>
      <Typography.Paragraph strong style={{ fontSize: 18 }}>
        {c.priceCents === 0 ? 'Бесплатно' : `${(c.priceCents / 100).toFixed(0)} ₽`}
      </Typography.Paragraph>
      <EnrollBuyButton courseId={c.id} priceCents={c.priceCents} enrolled={enrolled} />

      <Typography.Title level={4} style={{ marginTop: 32 }}>
        Программа
      </Typography.Title>
      <List
        dataSource={c.modules}
        locale={{ emptyText: 'Модули пока не добавлены' }}
        renderItem={(m) => (
          <List.Item>
            <div>
              <Typography.Text strong>{m.title}</Typography.Text>
              <div>
                <Typography.Text type="secondary">
                  {m.lessons.length
                    ? m.lessons.map((l) => l.title).join(' · ')
                    : 'Уроки появятся позже'}
                </Typography.Text>
              </div>
            </div>
          </List.Item>
        )}
      />
    </div>
  );
}
