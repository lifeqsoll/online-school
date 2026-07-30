import { useQuery } from '@tanstack/react-query';
import { Select, Typography, Table } from 'antd';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { useState } from 'react';
import { api } from '../../shared/api/client';
import { KnowledgeGraph } from './KnowledgeGraph';

export function CourseAnalytics({ courseId }: { courseId: string }) {
  const [userId, setUserId] = useState<string>();

  const students = useQuery({
    queryKey: ['enrollments-course', courseId],
    // backend has no list-by-course enrollments endpoint publicly — use submissions/users fallback
    queryFn: async () => {
      try {
        return await api<Array<{ id: string; email?: string }>>('/admin/users');
      } catch {
        return [] as Array<{ id: string; email?: string }>;
      }
    },
  });

  const radar = useQuery({
    queryKey: ['radar', courseId, userId],
    enabled: !!userId,
    queryFn: () =>
      api<{ labels: string[]; values: number[]; struggling: boolean[] }>(
        `/courses/${courseId}/analytics/radar/${userId}`,
      ),
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

  const radarData =
    radar.data?.labels.map((label, i) => ({
      topic: label,
      value: radar.data?.values[i] ?? 0,
      fullMark: 100,
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Typography.Title level={5}>Роза ветров ученика</Typography.Title>
        <Select
          style={{ width: 320, marginBottom: 12 }}
          placeholder="Выберите ученика (admin users)"
          options={(students.data ?? []).map((u) => ({
            value: u.id,
            label: u.email || u.id,
          }))}
          onChange={setUserId}
          showSearch
        />
        <div style={{ width: '100%', height: 320 }}>
          <ResponsiveContainer>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="topic" />
              <PolarRadiusAxis angle={30} domain={[0, 100]} />
              <Radar
                name="Mastery"
                dataKey="value"
                stroke="#beaaf2"
                fill="#beaaf2"
                fillOpacity={0.45}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
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
