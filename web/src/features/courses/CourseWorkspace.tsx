import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Form,
  Input,
  Tabs,
  Typography,
  Space,
  List,
  Modal,
  message,
} from 'antd';
import { useParams, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../../shared/api/client';
import { easeOutExpo, tabPanelVariants } from '../../shared/motion';
import { AssignmentConstructor } from '../assignments/AssignmentConstructor';
import { ReviewQueue } from '../assignments/ReviewQueue';
import { CourseAnalytics } from '../analytics/CourseAnalytics';
import { CourseStudents } from '../students/CourseStudents';
import { AssignCurators } from '../users/AssignCurators';
import { LeaderboardPanel } from '../xp/LeaderboardPanel';
import { CourseCalendarTab } from '../schedule/CourseCalendarTab';
import { LessonEditPanel } from './LessonEditPanel';

type CourseDetail = {
  id: string;
  title: string;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      type: string;
      content?: string | null;
      isPublished: boolean;
      videoUrl?: string | null;
      videoSource?: string | null;
    }>;
  }>;
};

export function CourseWorkspace({
  base: _base,
  isAdmin,
}: {
  base: '/admin' | '/curator';
  isAdmin: boolean;
}) {
  const { courseId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const qc = useQueryClient();
  const course = useQuery({
    queryKey: ['course', courseId],
    queryFn: () => api<CourseDetail>(`/courses/${courseId}`),
    enabled: !!courseId,
  });

  const [modOpen, setModOpen] = useState(false);
  const [lessonOpen, setLessonOpen] = useState<string | null>(null);
  const [editLesson, setEditLesson] = useState<
    CourseDetail['modules'][0]['lessons'][0] | null
  >(null);

  const activeTab = searchParams.get('tab') || 'content';
  const setTab = (key: string) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  const addModule = useMutation({
    mutationFn: (title: string) =>
      api(`/courses/${courseId}/modules`, { method: 'POST', json: { title } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      setModOpen(false);
    },
  });

  const addLesson = useMutation({
    mutationFn: (p: { moduleId: string; title: string }) =>
      api(`/modules/${p.moduleId}/lessons`, {
        method: 'POST',
        json: { title: p.title, type: 'TEXT', isPublished: true },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      setLessonOpen(null);
    },
  });

  if (!course.data) return <Typography.Text>Загрузка…</Typography.Text>;

  const tabs = [
    {
      key: 'content',
      label: 'Модули / Уроки',
      children: (
        <div>
          <Space style={{ marginBottom: 12 }}>
            <Button type="primary" onClick={() => setModOpen(true)}>
              Добавить модуль
            </Button>
          </Space>
          {course.data.modules.map((m) => (
            <div key={m.id} style={{ marginBottom: 20 }}>
              <Space>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {m.title}
                </Typography.Title>
                <Button size="small" onClick={() => setLessonOpen(m.id)}>
                  + Урок
                </Button>
              </Space>
              <List
                size="small"
                dataSource={m.lessons}
                renderItem={(l) => (
                  <List.Item
                    actions={[
                      <Button
                        key="edit"
                        type="link"
                        size="small"
                        onClick={() => setEditLesson(l)}
                      >
                        Редактировать
                      </Button>,
                    ]}
                  >
                    {l.title}{' '}
                    {l.isPublished ? (
                      <Typography.Text type="success">· published</Typography.Text>
                    ) : null}
                    <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                      {l.type}
                    </Typography.Text>
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
        <AssignmentConstructor
          courseId={courseId}
          modules={course.data.modules.map((m) => ({
            id: m.id,
            title: m.title,
            lessons: m.lessons,
          }))}
        />
      ),
    },
    {
      key: 'review',
      label: 'Проверка',
      children: <ReviewQueue courseId={courseId} />,
    },
    {
      key: 'students',
      label: 'Ученики',
      children: <CourseStudents courseId={courseId} />,
    },
    {
      key: 'analytics',
      label: 'Аналитика',
      children: <CourseAnalytics courseId={courseId} />,
    },
    {
      key: 'xp',
      label: 'XP',
      children: <LeaderboardPanel courseId={courseId} />,
    },
    {
      key: 'calendar',
      label: 'Календарь',
      children: (
        <CourseCalendarTab
          courseId={courseId}
          modules={course.data.modules.map((m) => ({
            id: m.id,
            title: m.title,
            lessons: m.lessons,
          }))}
        />
      ),
    },
  ];

  if (isAdmin) {
    tabs.push({
      key: 'curators',
      label: 'Кураторы',
      children: <AssignCurators courseId={courseId} />,
    });
  }

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        {course.data.title}
      </Typography.Title>
      <Tabs
        activeKey={activeTab}
        onChange={setTab}
        items={tabs.map(({ key, label }) => ({ key, label }))}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          variants={tabPanelVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ duration: 0.28, ease: easeOutExpo }}
        >
          {tabs.find((t) => t.key === activeTab)?.children}
        </motion.div>
      </AnimatePresence>

      <Modal title="Модуль" open={modOpen} onCancel={() => setModOpen(false)} footer={null}>
        <Form
          layout="vertical"
          onFinish={async (v) => {
            try {
              await addModule.mutateAsync(v.title);
              message.success('Модуль добавлен');
            } catch (e) {
              message.error(e instanceof Error ? e.message : 'Ошибка');
            }
          }}
        >
          <Form.Item name="title" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Сохранить
          </Button>
        </Form>
      </Modal>

      <Modal
        title="Урок"
        open={!!lessonOpen}
        onCancel={() => setLessonOpen(null)}
        footer={null}
      >
        <Form
          layout="vertical"
          onFinish={async (v) => {
            if (!lessonOpen) return;
            try {
              await addLesson.mutateAsync({ moduleId: lessonOpen, title: v.title });
              message.success('Урок добавлен');
            } catch (e) {
              message.error(e instanceof Error ? e.message : 'Ошибка');
            }
          }}
        >
          <Form.Item name="title" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Сохранить
          </Button>
        </Form>
      </Modal>
      <Modal
        title="Редактирование урока"
        open={!!editLesson}
        onCancel={() => setEditLesson(null)}
        footer={null}
        width={640}
        destroyOnClose
      >
        {editLesson ? (
          <LessonEditPanel
            lesson={editLesson}
            onClose={() => {
              setEditLesson(null);
              qc.invalidateQueries({ queryKey: ['course', courseId] });
            }}
          />
        ) : null}
      </Modal>
    </div>
  );
}
