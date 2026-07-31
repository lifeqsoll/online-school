import { useQuery } from '@tanstack/react-query';
import { Spin, Tag, Typography } from 'antd';
import {
  StarFilled,
  CheckCircleFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../../shared/api/client';
import { assignmentTypeLabel } from '../../shared/assignments/labels';
import { easeOutExpo, fadeUp, stagger } from '../../shared/motion';

type Enrollment = { courseId: string; course: { id: string; title: string } };
type Assignment = {
  id: string;
  title: string;
  maxXp: number;
  dueAt?: string | null;
  responseMode?: string | null;
  questions?: Array<{ type: string }>;
};
type Submission = {
  id: string;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_GRADED' | 'PENDING_REVIEW' | 'GRADED';
  attemptNo?: number;
  scoreXp?: number | null;
};

type HwStatus = 'todo' | 'in_progress' | 'pending' | 'done';

function statusOf(subs: Submission[] | undefined): HwStatus {
  if (!subs?.length) return 'todo';
  const finished = subs.filter((s) => s.status !== 'IN_PROGRESS');
  if (finished.some((s) => s.status === 'GRADED' || s.status === 'AUTO_GRADED')) {
    return 'done';
  }
  if (
    finished.some(
      (s) => s.status === 'PENDING_REVIEW' || s.status === 'SUBMITTED',
    )
  ) {
    return 'pending';
  }
  if (subs.some((s) => s.status === 'IN_PROGRESS')) return 'in_progress';
  return 'todo';
}

const STATUS_UI: Record<
  HwStatus,
  {
    label: string | null;
    color: string;
    border: string;
    bg: string;
  }
> = {
  todo: {
    label: 'Не сдано',
    color: 'default',
    border: '#ebebeb',
    bg: '#fff',
  },
  in_progress: {
    label: 'В работе',
    color: 'orange',
    border: '#ffd591',
    bg: '#fff7e6',
  },
  pending: {
    label: 'На проверке',
    color: 'blue',
    border: '#91caff',
    bg: '#e6f4ff',
  },
  done: {
    label: null,
    color: 'default',
    border: '#ebebeb',
    bg: '#fff',
  },
};

export function LkHomeworkPage() {
  const enrollments = useQuery({
    queryKey: ['me-enrollments'],
    queryFn: () => api<Enrollment[]>('/me/enrollments'),
  });

  const homework = useQuery({
    queryKey: ['all-hw', enrollments.data?.map((e) => e.courseId).join(',')],
    queryFn: async () => {
      const enrolls = enrollments.data ?? [];
      const perCourse = await Promise.all(
        enrolls.map(async (e) => {
          try {
            const list = await api<Assignment[]>(
              `/courses/${e.courseId}/assignments`,
            );
            return { e, list: Array.isArray(list) ? list : [] };
          } catch {
            return { e, list: [] as Assignment[] };
          }
        }),
      );

      const rows: Array<
        Assignment & {
          courseTitle: string;
          courseId: string;
          hwStatus: HwStatus;
        }
      > = [];

      await Promise.all(
        perCourse.flatMap(({ e, list }) =>
          list.map(async (a) => {
            let hwStatus: HwStatus = 'todo';
            try {
              const subs = await api<Submission[]>(
                `/assignments/${a.id}/submissions/me`,
              );
              hwStatus = statusOf(Array.isArray(subs) ? subs : []);
            } catch {
              hwStatus = 'todo';
            }
            rows.push({
              ...a,
              courseTitle: e.course.title,
              courseId: e.courseId,
              hwStatus,
            });
          }),
        ),
      );

      const order: Record<HwStatus, number> = {
        todo: 0,
        in_progress: 1,
        pending: 2,
        done: 3,
      };
      return rows.sort((a, b) => order[a.hwStatus] - order[b.hwStatus]);
    },
    enabled: !!enrollments.data?.length,
  });

  if (enrollments.isLoading || homework.isLoading) {
    return <Spin style={{ margin: 48 }} />;
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Домашние задания
      </Typography.Title>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        {(homework.data ?? []).map((a, i) => {
          const ui = STATUS_UI[a.hwStatus];
          const done = a.hwStatus === 'done';
          const typeLabel = assignmentTypeLabel(a.responseMode, a.questions);
          return (
            <motion.div key={a.id} variants={fadeUp} custom={i}>
              <Link
                to={`/lk/assignments/${a.id}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <motion.div
                  whileHover={{ y: -2 }}
                  transition={{ duration: 0.2, ease: easeOutExpo }}
                  style={{
                    display: 'flex',
                    gap: 12,
                    background: ui.bg,
                    border: `1px solid ${ui.border}`,
                    borderRadius: 14,
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#69b1ff' }}>
                      {typeLabel}
                      {a.dueAt
                        ? ` · дедлайн ${dayjs(a.dueAt).format('D MMM / HH:mm')}`
                        : ''}
                    </div>
                    <div
                      style={{
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span>{a.title}</span>
                      {done ? (
                        <CheckCircleFilled
                          style={{ color: '#52c41a', fontSize: 15 }}
                          title="Выполнено"
                        />
                      ) : null}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-end',
                      gap: 6,
                      flexShrink: 0,
                    }}
                  >
                    {ui.label ? (
                      <Tag color={ui.color} style={{ margin: 0 }}>
                        {ui.label}
                      </Tag>
                    ) : null}
                    <span>
                      <StarFilled style={{ color: '#faad14' }} /> +{a.maxXp}
                    </span>
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          );
        })}
        {!homework.data?.length ? (
          <Typography.Text type="secondary">Пока нет заданий</Typography.Text>
        ) : null}
      </motion.div>
    </div>
  );
}
