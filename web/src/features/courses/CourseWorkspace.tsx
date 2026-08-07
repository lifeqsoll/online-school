import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Tabs,
  Typography,
  Space,
  List,
  Modal,
  message,
  Switch,
  Tag,
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
import { CourseCoverControls } from '../../shared/courses/CourseCoverControls';
import { CourseRemindersTab } from './CourseRemindersTab';
import { CourseCatalogMediaControls } from '../../shared/courses/CourseCatalogMediaControls';
import { CourseLessonAttendanceTab } from './CourseLessonAttendanceTab';

type CourseDetail = {
  id: string;
  title: string;
  description?: string | null;
  catalogBody?: string | null;
  priceCents?: number;
  isPublished?: boolean;
  coverUrl?: string | null;
  promoPlayback?: { kind: string; url: string } | null;
  modules: Array<{
    id: string;
    title: string;
    radarLabel?: string | null;
    lessons: Array<{
      id: string;
      title: string;
      type: string;
      content?: string | null;
      isPublished: boolean;
      videoUrl?: string | null;
      videoSource?: string | null;
      scheduledAt?: string | null;
      endsAt?: string | null;
      meetingUrl?: string | null;
      contentUnlockDaysBefore?: number;
      contentUnlockedForAll?: boolean;
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
  const [editModule, setEditModule] = useState<
    CourseDetail['modules'][0] | null
  >(null);
  const [lessonOpen, setLessonOpen] = useState<string | null>(null);
  const [editLesson, setEditLesson] = useState<
    CourseDetail['modules'][0]['lessons'][0] | null
  >(null);

  const activeTab = searchParams.get('tab') || 'content';
  const setTab = (key: string) => {
    setSearchParams({ tab: key }, { replace: true });
  };

  const addModule = useMutation({
    mutationFn: (v: { title: string; radarLabel?: string }) =>
      api(`/courses/${courseId}/modules`, {
        method: 'POST',
        json: {
          title: v.title,
          radarLabel: v.radarLabel?.trim() || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      setModOpen(false);
    },
  });

  const saveModule = useMutation({
    mutationFn: (v: { id: string; title: string; radarLabel?: string }) =>
      api(`/modules/${v.id}`, {
        method: 'PATCH',
        json: {
          title: v.title,
          radarLabel: v.radarLabel?.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] });
      setEditModule(null);
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

  const removeLesson = (lessonId: string, title: string) => {
    Modal.confirm({
      title: 'Удалить урок?',
      content: `«${title}» будет удалён безвозвратно.`,
      okText: 'Удалить',
      okType: 'danger',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          await api(`/lessons/${lessonId}`, { method: 'DELETE' });
          message.success('Урок удалён');
          if (editLesson?.id === lessonId) setEditLesson(null);
          qc.invalidateQueries({ queryKey: ['course', courseId] });
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Ошибка');
        }
      },
    });
  };

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
              <Space wrap>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {m.title}
                </Typography.Title>
                {m.radarLabel ? (
                  <Tag color="gold">роза: {m.radarLabel}</Tag>
                ) : null}
                <Button size="small" onClick={() => setEditModule(m)}>
                  Подпись розы
                </Button>
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
                      <Button
                        key="del"
                        type="link"
                        size="small"
                        danger
                        onClick={() => removeLesson(l.id, l.title)}
                      >
                        Удалить
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
                    {l.scheduledAt ? (
                      <Tag color="blue" style={{ marginLeft: 8 }}>
                        {new Date(l.scheduledAt).toLocaleString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Tag>
                    ) : null}
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
    {
      key: 'reminders',
      label: 'Напоминания',
      children: <CourseRemindersTab courseId={courseId} />,
    },
    {
      key: 'attendance',
      label: 'Выполненные уроки',
      children: (
        <CourseLessonAttendanceTab
          courseId={courseId}
          lessons={course.data.modules.flatMap((m) =>
            m.lessons.map((l) => ({
              id: l.id,
              title: l.title,
              type: l.type,
              scheduledAt: l.scheduledAt,
              meetingUrl: l.meetingUrl,
              moduleTitle: m.title,
            })),
          )}
        />
      ),
    },
    {
      key: 'settings',
      label: 'Настройки',
      children: (
        <div style={{ maxWidth: 640 }}>
          <Form
            layout="vertical"
            key={`settings-${course.data.id}-${course.data.isPublished}-${course.data.title}-${course.data.catalogBody ?? ''}`}
            initialValues={{
              title: course.data.title,
              description: course.data.description ?? '',
              catalogBody: course.data.catalogBody ?? '',
              priceCents: course.data.priceCents ?? 0,
              isPublished: !!course.data.isPublished,
            }}
            onFinish={async (v) => {
              try {
                await api(`/courses/${courseId}`, {
                  method: 'PATCH',
                  json: {
                    title: v.title,
                    description: v.description || undefined,
                    catalogBody: v.catalogBody ?? '',
                    priceCents: v.priceCents ?? 0,
                    isPublished: !!v.isPublished,
                  },
                });
                message.success(
                  v.isPublished ? 'Курс опубликован' : 'Курс сохранён как черновик',
                );
                await qc.invalidateQueries({ queryKey: ['course', courseId] });
                await qc.invalidateQueries({ queryKey: ['courses'] });
              } catch (e) {
                message.error(e instanceof Error ? e.message : 'Ошибка');
              }
            }}
          >
            <Form.Item name="title" label="Название" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="description" label="Краткое описание">
              <Input.TextArea rows={3} placeholder="В карточке и в шапке страницы курса" />
            </Form.Item>
            <Form.Item name="priceCents" label="Цена (копейки, 0 = бесплатно)">
              <InputNumber className="w-full" min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="isPublished"
              label="Публикация"
              valuePropName="checked"
              extra="Опубликованный курс виден в каталоге и доступен для записи."
            >
              <Switch checkedChildren="Опубликован" unCheckedChildren="Черновик" />
            </Form.Item>

            <div style={{ margin: '8px 0 24px' }}>
              <CourseCatalogMediaControls
                courseId={courseId}
                promoPlayback={course.data.promoPlayback}
                onChanged={() =>
                  qc.invalidateQueries({ queryKey: ['course', courseId] })
                }
              />
            </div>

            <Form.Item
              name="catalogBody"
              label="Текст о курсе"
              extra="Показывается на странице курса под промо-видео."
            >
              <Input.TextArea
                rows={8}
                placeholder="Подробный текст о программе, формате занятий, для кого курс…"
                maxLength={12000}
                showCount
              />
            </Form.Item>

            <Button type="primary" htmlType="submit">
              Сохранить
            </Button>
          </Form>
        </div>
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          marginBottom: 8,
        }}
      >
        <div>
          <Space align="center" wrap style={{ marginBottom: 4 }}>
            <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 0 }}>
              {course.data.title}
            </Typography.Title>
            {course.data.isPublished ? (
              <Tag color="green">Опубликован</Tag>
            ) : (
              <Tag>Черновик</Tag>
            )}
          </Space>
        </div>
        <CourseCoverControls
          courseId={courseId}
          coverUrl={course.data.coverUrl}
          onChanged={() =>
            qc.invalidateQueries({ queryKey: ['course', courseId] })
          }
        />
      </div>
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
              await addModule.mutateAsync(v);
              message.success('Модуль добавлен');
            } catch (e) {
              message.error(e instanceof Error ? e.message : 'Ошибка');
            }
          }}
        >
          <Form.Item name="title" label="Название" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="radarLabel"
            label="Подпись на розе ветров"
            extra="Если пусто — на оси будет название модуля"
          >
            <Input maxLength={80} placeholder="Короткое имя оси" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Сохранить
          </Button>
        </Form>
      </Modal>

      <Modal
        title="Подпись модуля на розе ветров"
        open={!!editModule}
        onCancel={() => setEditModule(null)}
        footer={null}
        destroyOnClose
      >
        {editModule ? (
          <Form
            layout="vertical"
            key={editModule.id}
            initialValues={{
              title: editModule.title,
              radarLabel: editModule.radarLabel ?? '',
            }}
            onFinish={async (v) => {
              try {
                await saveModule.mutateAsync({
                  id: editModule.id,
                  title: v.title,
                  radarLabel: v.radarLabel,
                });
                message.success('Сохранено');
              } catch (e) {
                message.error(e instanceof Error ? e.message : 'Ошибка');
              }
            }}
          >
            <Form.Item name="title" label="Название модуля" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item
              name="radarLabel"
              label="Подпись на розе ветров"
              extra="Куратор может задать короткое имя оси"
            >
              <Input maxLength={80} placeholder={editModule.title} />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={saveModule.isPending}>
              Сохранить
            </Button>
          </Form>
        ) : null}
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
            courseId={courseId}
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
