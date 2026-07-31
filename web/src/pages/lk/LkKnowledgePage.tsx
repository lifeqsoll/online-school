import { useQuery } from '@tanstack/react-query';
import { Empty, Input, Typography, Tag } from 'antd';
import {
  BookOutlined,
  SearchOutlined,
  RightOutlined,
  FolderOpenOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '../../shared/api/client';
import { FileList } from '../../shared/files/FileList';
import { easeOutExpo } from '../../shared/motion';
import {
  LessonTypeIcon,
  lessonKindLabel,
  resolveLessonKind,
} from '../../shared/lessons/lessonTypeIcon';

type Enrollment = {
  courseId: string;
  course: { id: string; title: string };
};

type Lesson = {
  id: string;
  title: string;
  type: string;
  content?: string | null;
  isPublished: boolean;
  scheduledAt?: string | null;
  meetingUrl?: string | null;
};

type Module = {
  id: string;
  title: string;
  lessons: Lesson[];
};

type CourseDetail = {
  id: string;
  title: string;
  modules: Module[];
};

export function LkKnowledgePage() {
  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Enrollment[]>('/me/enrollments'),
  });

  const [courseId, setCourseId] = useState<string>();
  const [q, setQ] = useState('');
  const [openModule, setOpenModule] = useState<string | null>(null);
  const [openFiles, setOpenFiles] = useState<string | null>(null);

  const options = useMemo(
    () =>
      (enrollments.data ?? []).map((e) => ({
        value: e.courseId,
        label: e.course?.title ?? e.courseId,
      })),
    [enrollments.data],
  );

  const activeId = courseId ?? options[0]?.value;

  const course = useQuery({
    queryKey: ['course', activeId],
    queryFn: () => api<CourseDetail>(`/courses/${activeId}`),
    enabled: !!activeId,
  });

  const modules = course.data?.modules ?? [];
  const activeModuleId = openModule ?? modules[0]?.id ?? null;

  const filteredLessons = useMemo(() => {
    const mod = modules.find((m) => m.id === activeModuleId);
    const lessons = mod?.lessons ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return lessons;
    return lessons.filter(
      (l) =>
        l.title.toLowerCase().includes(needle) ||
        (l.content ?? '').toLowerCase().includes(needle),
    );
  }, [modules, activeModuleId, q]);

  if (!enrollments.isLoading && !options.length) {
    return (
      <Empty description="Нет записанных курсов — база знаний появится после записи" />
    );
  }

  return (
    <div style={{ maxWidth: 1080 }}>
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
          База знаний
        </Typography.Title>
        <Typography.Text type="secondary">
          Уроки и материалы курсов в одном месте
        </Typography.Text>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        {options.map((o) => {
          const active = o.value === activeId;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                setCourseId(o.value);
                setOpenModule(null);
                setOpenFiles(null);
              }}
              style={{
                border: active ? '1px solid #beaaf2' : '1px solid #ebebeb',
                background: active ? 'rgba(190, 170, 242, 0.28)' : '#fff',
                color: active ? '#6b4fb8' : '#595959',
                borderRadius: 999,
                padding: '8px 14px',
                cursor: 'pointer',
                fontWeight: active ? 600 : 500,
                fontSize: 13,
              }}
            >
              <BookOutlined style={{ marginRight: 6 }} />
              {o.label}
            </button>
          );
        })}
      </div>

      <Input
        allowClear
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        placeholder="Поиск по урокам…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{
          marginBottom: 18,
          maxWidth: 420,
          borderRadius: 12,
          height: 40,
        }}
      />

      {!course.data ? (
        <Typography.Text type="secondary">Загрузка…</Typography.Text>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 240px) 1fr',
            gap: 16,
            alignItems: 'start',
          }}
        >
          <aside
            style={{
              background: '#fff',
              border: '1px solid #ebebeb',
              borderRadius: 16,
              padding: 12,
              position: 'sticky',
              top: 16,
            }}
          >
            <Typography.Text
              type="secondary"
              style={{
                fontSize: 11,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 8,
                paddingInline: 8,
              }}
            >
              Модули
            </Typography.Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {modules.map((m) => {
                const active = m.id === activeModuleId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setOpenModule(m.id);
                      setOpenFiles(null);
                    }}
                    style={{
                      textAlign: 'left',
                      border: 'none',
                      borderRadius: 12,
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: active
                        ? 'rgba(190, 170, 242, 0.35)'
                        : 'transparent',
                      color: active ? '#6b4fb8' : '#595959',
                      fontWeight: active ? 600 : 500,
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                      }}
                    >
                      <FolderOpenOutlined />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {m.title}
                      </span>
                    </span>
                    <Tag
                      style={{
                        margin: 0,
                        border: 'none',
                        background: active
                          ? 'rgba(107, 79, 184, 0.12)'
                          : '#f5f5f5',
                      }}
                    >
                      {m.lessons.length}
                    </Tag>
                  </button>
                );
              })}
              {!modules.length ? (
                <Typography.Text type="secondary" style={{ padding: 8 }}>
                  Нет модулей
                </Typography.Text>
              ) : null}
            </div>
          </aside>

          <section
            style={{
              background: '#fff',
              border: '1px solid #ebebeb',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid #f0f0f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div>
                <Typography.Text strong style={{ fontSize: 15 }}>
                  {modules.find((m) => m.id === activeModuleId)?.title ??
                    'Уроки'}
                </Typography.Text>
                <div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {filteredLessons.length}{' '}
                    {filteredLessons.length === 1 ? 'урок' : 'уроков'}
                  </Typography.Text>
                </div>
              </div>
            </div>

            {filteredLessons.length ? (
              <div>
                {filteredLessons.map((l, idx) => {
                  const filesOpen = openFiles === l.id;
                  return (
                    <motion.div
                      key={l.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        duration: 0.22,
                        delay: Math.min(idx * 0.03, 0.2),
                        ease: easeOutExpo,
                      }}
                      style={{
                        borderBottom:
                          idx === filteredLessons.length - 1
                            ? 'none'
                            : '1px solid #f0f0f0',
                        padding: '14px 18px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          justifyContent: 'space-between',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 12,
                            minWidth: 0,
                            flex: 1,
                          }}
                        >
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 10,
                              background: '#f7f5ff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              fontSize: 16,
                            }}
                          >
                            <LessonTypeIcon lesson={l} style={{ marginTop: 0, fontSize: 18 }} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, marginBottom: 2 }}>
                              {l.title}
                            </div>
                            {l.content ? (
                              <Typography.Paragraph
                                type="secondary"
                                ellipsis={{ rows: 1 }}
                                style={{ marginBottom: 0, fontSize: 13 }}
                              >
                                {l.content}
                              </Typography.Paragraph>
                            ) : (
                              <Typography.Text
                                type="secondary"
                                style={{ fontSize: 12 }}
                              >
                                {lessonKindLabel(resolveLessonKind(l))}
                              </Typography.Text>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexShrink: 0,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenFiles(filesOpen ? null : l.id)
                            }
                            style={{
                              border: '1px solid #ebebeb',
                              background: filesOpen ? '#f7f5ff' : '#fff',
                              borderRadius: 10,
                              padding: '6px 10px',
                              cursor: 'pointer',
                              color: '#6b4fb8',
                              fontSize: 12,
                              fontWeight: 500,
                            }}
                          >
                            <PaperClipOutlined style={{ marginRight: 4 }} />
                            Файлы
                          </button>
                          <Link
                            to={`/lk/lessons/${l.id}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: 'var(--accent)',
                              color: '#fff',
                              borderRadius: 10,
                              padding: '7px 12px',
                              fontSize: 12,
                              fontWeight: 600,
                              textDecoration: 'none',
                            }}
                          >
                            Открыть
                            <RightOutlined style={{ fontSize: 10 }} />
                          </Link>
                        </div>
                      </div>

                      {filesOpen ? (
                        <div
                          style={{
                            marginTop: 12,
                            marginLeft: 48,
                            padding: 12,
                            background: '#fafafa',
                            borderRadius: 12,
                            border: '1px solid #f0f0f0',
                          }}
                        >
                          <Typography.Text
                            type="secondary"
                            style={{
                              fontSize: 12,
                              display: 'block',
                              marginBottom: 8,
                            }}
                          >
                            Материалы урока
                          </Typography.Text>
                          <FileList
                            ownerType="LESSON_MATERIAL"
                            ownerId={l.id}
                            canDelete={false}
                          />
                        </div>
                      ) : null}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: 32 }}>
                <Empty
                  description={
                    q.trim()
                      ? 'Ничего не найдено по запросу'
                      : 'В этом модуле пока нет уроков'
                  }
                />
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
