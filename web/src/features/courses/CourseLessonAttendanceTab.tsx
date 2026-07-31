import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { useMemo, useState } from 'react';
import { api } from '../../shared/api/client';
import {
  lessonKindLabel,
  resolveLessonKind,
} from '../../shared/lessons/lessonTypeIcon';

type CourseLesson = {
  id: string;
  title: string;
  type?: string;
  scheduledAt?: string | null;
  meetingUrl?: string | null;
  moduleId?: string;
  moduleTitle?: string;
};

type AttendanceStudent = {
  userId: string;
  displayName: string;
  nickname?: string | null;
  viewedAt?: string | null;
  completedAt?: string | null;
  completedBy?: 'AUTO' | 'CURATOR' | null;
  maxProgressPct: number;
};

type AttendancePayload = {
  lesson: {
    id: string;
    title: string;
    type: string;
    scheduledAt?: string | null;
    moduleTitle: string;
  };
  students: AttendanceStudent[];
};

export function CourseLessonAttendanceTab({
  courseId,
  lessons,
}: {
  courseId: string;
  lessons: CourseLesson[];
}) {
  const qc = useQueryClient();
  const [lessonId, setLessonId] = useState<string | undefined>(
    lessons[0]?.id,
  );

  const options = useMemo(
    () =>
      lessons.map((l) => ({
        value: l.id,
        label: `${l.moduleTitle ? `${l.moduleTitle} · ` : ''}${l.title} (${lessonKindLabel(resolveLessonKind(l))})`,
      })),
    [lessons],
  );

  const attendance = useQuery({
    queryKey: ['lesson-attendance', courseId, lessonId],
    queryFn: () =>
      api<AttendancePayload>(
        `/courses/${courseId}/lessons/${lessonId}/attendance`,
      ),
    enabled: !!lessonId,
  });

  const setAtt = useMutation({
    mutationFn: (body: {
      completed: boolean;
      all?: boolean;
      userIds?: string[];
    }) =>
      api(`/courses/${courseId}/lessons/${lessonId}/attendance`, {
        method: 'POST',
        json: body,
      }),
    onSuccess: async (_r, vars) => {
      message.success(
        vars.completed ? 'Зачёт проставлен' : 'Зачёт снят',
      );
      await qc.invalidateQueries({
        queryKey: ['lesson-attendance', courseId, lessonId],
      });
    },
    onError: (e: Error) => message.error(e.message || 'Ошибка'),
  });

  const students = attendance.data?.students ?? [];
  const doneCount = students.filter((s) => !!s.completedAt).length;

  return (
    <div>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Начислите или снимите выполнение урока вручную. Автозачёт: видео ≥80%,
        текст и LIVE — 2 минуты на странице.
      </Typography.Paragraph>

      <Space wrap style={{ marginBottom: 16, width: '100%' }} size="middle">
        <Select
          style={{ minWidth: 320, maxWidth: 520 }}
          placeholder="Выберите урок"
          value={lessonId}
          options={options}
          onChange={(v) => setLessonId(v)}
          showSearch
          optionFilterProp="label"
        />
        <Button
          type="primary"
          disabled={!lessonId || !students.length}
          loading={setAtt.isPending}
          onClick={() => setAtt.mutate({ completed: true, all: true })}
        >
          Отметить всех
        </Button>
        <Button
          danger
          disabled={!lessonId || doneCount === 0}
          loading={setAtt.isPending}
          onClick={() => setAtt.mutate({ completed: false, all: true })}
        >
          Снять у всех
        </Button>
        <Typography.Text type="secondary">
          Выполнено: {doneCount} / {students.length}
        </Typography.Text>
      </Space>

      <Table
        rowKey="userId"
        loading={attendance.isLoading}
        dataSource={students}
        pagination={false}
        locale={{ emptyText: lessonId ? 'Нет зачисленных учеников' : 'Выберите урок' }}
        columns={[
          {
            title: 'Ученик',
            dataIndex: 'displayName',
            render: (name: string, row) => (
              <span>
                {name}
                {row.nickname ? (
                  <Typography.Text type="secondary"> @{row.nickname}</Typography.Text>
                ) : null}
              </span>
            ),
          },
          {
            title: 'Прогресс',
            width: 100,
            render: (_: unknown, row) => `${row.maxProgressPct}%`,
          },
          {
            title: 'Источник',
            width: 120,
            render: (_: unknown, row) => {
              if (!row.completedAt) return '—';
              return (
                <Tag color={row.completedBy === 'CURATOR' ? 'purple' : 'blue'}>
                  {row.completedBy === 'CURATOR' ? 'Куратор' : 'Авто'}
                </Tag>
              );
            },
          },
          {
            title: 'Выполнен',
            width: 110,
            render: (_: unknown, row) => (
              <Switch
                checked={!!row.completedAt}
                loading={setAtt.isPending}
                onChange={(checked) =>
                  setAtt.mutate({
                    completed: checked,
                    userIds: [row.userId],
                  })
                }
              />
            ),
          },
        ]}
      />
    </div>
  );
}
