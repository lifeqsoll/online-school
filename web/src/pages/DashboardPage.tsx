import { Typography, Card, Col, Row } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '../shared/api/client';

export function DashboardPage({ title }: { title: string }) {
  const courses = useQuery({
    queryKey: ['courses'],
    queryFn: () => api<unknown[]>('/courses'),
  });

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {title}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Панель «Олимпиадная школа» — курсы, ДЗ, аналитика и успеваемость.
      </Typography.Paragraph>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Typography.Text type="secondary">Курсов доступно</Typography.Text>
            <Typography.Title level={2} style={{ margin: 0 }}>
              {courses.data?.length ?? '—'}
            </Typography.Title>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
