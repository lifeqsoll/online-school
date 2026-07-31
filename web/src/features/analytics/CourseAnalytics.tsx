import { useQuery } from '@tanstack/react-query';
import { Select, Typography, Table } from 'antd';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useState } from 'react';
import { api } from '../../shared/api/client';
import { KnowledgeGraph } from './KnowledgeGraph';
import { WindRoseChart } from '../../shared/analytics/WindRoseChart';

type EnrollmentRow = {
  userId: string;
  user?: {
    email?: string | null;
    nickname?: string | null;
    displayName?: string;
    firstName?: string;
  };
};

export function CourseAnalytics({ courseId }: { courseId: string }) {
  const [userId, setUserId] = useState<string>();

  const students = useQuery({
    queryKey: ['enrollments-course', courseId],
    queryFn: async () => {
      try {
        return await api<EnrollmentRow[]>(`/courses/${courseId}/enrollments`);
      } catch {
        return [] as EnrollmentRow[];
      }
    },
  });

  const radar = useQuery({
    queryKey: ['radar', courseId, userId],
    enabled: !!userId,
    queryFn: () =>
      api<{
        labels: string[];
        values: number[];
        scaleValues?: number[];
        scaleMax?: number;
      }>(`/courses/${courseId}/analytics/radar/${userId}`),
  });

  const cold = useQuery({
    queryKey: ['cold', courseId],
    queryFn: () =>
      api<
        Array<{
          lessonId: string;
          title: string;
          views: number;
          completes: number;
          completeRate: number;
        }>
      >(`/courses/${courseId}/analytics/cold-lessons`),
  });

  const struggling = useQuery({
    queryKey: ['struggling', courseId],
    queryFn: () =>
      api<Array<{ topicId: string; name: string; strugglingStudents: number }>>(
        `/courses/${courseId}/analytics/struggling-topics`,
      ),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Typography.Title level={5}>Роза ветров ученика</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
          По модулям: пройденные уроки + ДЗ ≥75%
        </Typography.Paragraph>
        <Select
          style={{ width: 320, marginBottom: 12 }}
          placeholder="Выберите ученика"
          options={(students.data ?? []).map((u) => ({
            value: u.userId,
            label:
              u.user?.displayName ||
              u.user?.nickname ||
              u.user?.firstName ||
              u.user?.email ||
              u.userId,
          }))}
          onChange={setUserId}
          showSearch
          optionFilterProp="label"
        />
        <WindRoseChart
          data={userId ? radar.data : undefined}
          loading={!!userId && radar.isLoading}
          emptyText={
            userId
              ? 'Нет модулей или данных'
              : 'Выберите ученика, чтобы увидеть розу'
          }
        />
      </div>

      <div>
        <Typography.Title level={5}>Холодные уроки</Typography.Title>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={cold.data ?? []}>
              <XAxis dataKey="title" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="completeRate" fill="#94c8ff" name="Complete rate" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Table
          size="small"
          rowKey="lessonId"
          dataSource={cold.data ?? []}
          pagination={false}
          columns={[
            { title: 'Урок', dataIndex: 'title' },
            { title: 'Views', dataIndex: 'views' },
            { title: 'Completes', dataIndex: 'completes' },
            {
              title: 'Rate',
              dataIndex: 'completeRate',
              render: (v: number) => v.toFixed(2),
            },
          ]}
        />
      </div>

      <div>
        <Typography.Title level={5}>Темы-затыки</Typography.Title>
        <Table
          size="small"
          rowKey="topicId"
          dataSource={struggling.data ?? []}
          columns={[
            { title: 'Тема', dataIndex: 'name' },
            { title: 'Учеников struggling', dataIndex: 'strugglingStudents' },
          ]}
        />
      </div>

      <div>
        <Typography.Title level={5}>Граф знаний</Typography.Title>
        <KnowledgeGraph courseId={courseId} />
      </div>
    </div>
  );
}
