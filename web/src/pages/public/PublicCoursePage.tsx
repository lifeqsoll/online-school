import { useQuery } from '@tanstack/react-query';
import { Button, Spin, Typography } from 'antd';
import {
  DownloadOutlined,
  FileOutlined,
  FileImageOutlined,
} from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api, getAccessToken } from '../../shared/api/client';
import { useAuth } from '../../shared/auth/AuthContext';
import { EnrollBuyButton } from '../../features/catalog/EnrollBuyButton';
import { easeOutExpo, fadeUp, stagger } from '../../shared/motion';
import { courseColor } from '../../shared/schedule/courseColor';

type CourseDetail = {
  id: string;
  title: string;
  description?: string | null;
  catalogBody?: string | null;
  priceCents: number;
  coverUrl?: string | null;
  promoPlayback?: { kind: string; url: string } | null;
  catalogMaterials?: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    url: string;
  }>;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{ id: string; title: string }>;
  }>;
};

type Enrollment = { courseId: string };

function toEmbedUrl(url: string, kind: string): string {
  if (kind === 'youtube') {
    try {
      const u = new URL(url);
      const id = u.hostname.includes('youtu.be')
        ? u.pathname.slice(1)
        : u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    } catch {
      /* */
    }
  }
  if (kind === 'vimeo') {
    const m = url.match(/vimeo\.com\/(\d+)/);
    if (m) return `https://player.vimeo.com/video/${m[1]}`;
  }
  return url;
}

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}

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

  if (course.isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }
  if (!course.data) {
    return (
      <Typography.Text type="danger" style={{ display: 'block', padding: 48 }}>
        Курс не найден
      </Typography.Text>
    );
  }

  const c = course.data;
  const enrolled = !!enrollments.data?.some((e) => e.courseId === c.id);
  const colors = courseColor(c.id);
  const free = c.priceCents === 0;
  const hasCover = !!c.coverUrl;

  return (
    <div
      style={{
        background:
          'radial-gradient(ellipse 70% 40% at 30% 0%, rgba(190,170,242,0.2), transparent 55%), #f7f6fb',
        minHeight: 'calc(100vh - 140px)',
        paddingBottom: 48,
      }}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        variants={stagger}
        style={{ maxWidth: 840, margin: '0 auto', padding: '36px 24px' }}
      >
        <motion.div
          variants={fadeUp}
          custom={0}
          style={{
            background: hasCover
              ? `#1a1525 url(${c.coverUrl}) center/cover no-repeat`
              : '#fff',
            borderRadius: 20,
            border: hasCover
              ? '1px solid rgba(0,0,0,0.08)'
              : '1px solid rgba(190,170,242,0.3)',
            overflow: 'hidden',
            marginBottom: 24,
            position: 'relative',
            minHeight: hasCover ? 280 : undefined,
          }}
        >
          {hasCover ? (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(180deg, rgba(20,16,32,0.2) 0%, rgba(12,10,20,0.75) 55%, rgba(10,8,18,0.92) 100%)',
                pointerEvents: 'none',
              }}
            />
          ) : (
            <div
              style={{
                height: 10,
                background: `linear-gradient(90deg, ${colors.border}, ${colors.bg})`,
              }}
            />
          )}
          <div
            style={{
              padding: '28px 28px 24px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                fontSize: 12,
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: 999,
                background: free
                  ? hasCover
                    ? 'rgba(82,196,26,0.28)'
                    : 'rgba(82,196,26,0.12)'
                  : hasCover
                    ? 'rgba(255,255,255,0.22)'
                    : 'rgba(190,170,242,0.2)',
                color: free
                  ? hasCover
                    ? '#b7eb8f'
                    : '#389e0d'
                  : hasCover
                    ? '#fff'
                    : '#6b4fb8',
                marginBottom: 14,
                backdropFilter: hasCover ? 'blur(6px)' : undefined,
              }}
            >
              {free ? 'Бесплатно' : `${(c.priceCents / 100).toFixed(0)} ₽`}
            </span>
            <Typography.Title
              level={2}
              style={{
                marginTop: 0,
                marginBottom: 10,
                letterSpacing: '-0.02em',
                color: hasCover ? '#fff' : undefined,
              }}
            >
              {c.title}
            </Typography.Title>
            <Typography.Paragraph
              style={{
                fontSize: 16,
                maxWidth: 560,
                color: hasCover ? 'rgba(255,255,255,0.78)' : undefined,
              }}
              type={hasCover ? undefined : 'secondary'}
            >
              {c.description || 'Описание скоро появится'}
            </Typography.Paragraph>
            <div style={{ marginTop: 8 }}>
              <EnrollBuyButton
                courseId={c.id}
                priceCents={c.priceCents}
                enrolled={enrolled}
              />
            </div>
          </div>
        </motion.div>

        {c.promoPlayback || c.catalogBody ? (
          <motion.div variants={fadeUp} custom={0.5} style={{ marginBottom: 24 }}>
            <Typography.Title level={4} style={{ marginBottom: 14 }}>
              О курсе
            </Typography.Title>
            {c.promoPlayback ? (
              <div
                style={{
                  borderRadius: 18,
                  overflow: 'hidden',
                  background: '#111',
                  aspectRatio: '16 / 9',
                  border: '1px solid rgba(0,0,0,0.08)',
                  boxShadow: '0 12px 40px rgba(20,16,40,0.12)',
                  marginBottom: c.catalogBody ? 18 : 0,
                }}
              >
                {c.promoPlayback.kind === 'youtube' ||
                c.promoPlayback.kind === 'vimeo' ? (
                  <iframe
                    title="promo"
                    src={toEmbedUrl(c.promoPlayback.url, c.promoPlayback.kind)}
                    style={{ width: '100%', height: '100%', border: 0 }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <video
                    src={c.promoPlayback.url}
                    controls
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                )}
              </div>
            ) : null}
            {c.catalogBody ? (
              <Typography.Paragraph
                style={{
                  fontSize: 16,
                  lineHeight: 1.7,
                  whiteSpace: 'pre-wrap',
                  marginBottom: 0,
                  maxWidth: 720,
                }}
              >
                {c.catalogBody}
              </Typography.Paragraph>
            ) : null}
          </motion.div>
        ) : null}

        {(c.catalogMaterials?.length ?? 0) > 0 ? (
          <motion.div variants={fadeUp} custom={0.7} style={{ marginBottom: 28 }}>
            <Typography.Title level={4} style={{ marginBottom: 14 }}>
              Материалы для ознакомления
            </Typography.Title>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {c.catalogMaterials!.map((f) => {
                const isImage = f.mimeType.startsWith('image/');
                return (
                  <div
                    key={f.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      background: '#fff',
                      borderRadius: 14,
                      border: '1px solid rgba(190,170,242,0.25)',
                      padding: '12px 16px',
                    }}
                  >
                    <span style={{ color: '#6b4fb8', fontSize: 20 }}>
                      {isImage ? <FileImageOutlined /> : <FileOutlined />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{f.originalName}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {formatSize(f.sizeBytes)}
                      </Typography.Text>
                    </div>
                    <Button
                      type="primary"
                      ghost
                      icon={<DownloadOutlined />}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      disabled={!f.url}
                    >
                      Скачать
                    </Button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : null}

        <motion.div variants={fadeUp} custom={1}>
          <Typography.Title level={4} style={{ marginBottom: 14 }}>
            Программа
          </Typography.Title>
          {!c.modules.length ? (
            <Typography.Text type="secondary">Модули пока не добавлены</Typography.Text>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {c.modules.map((m, i) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + i * 0.06, duration: 0.4, ease: easeOutExpo }}
                  style={{
                    background: '#fff',
                    borderRadius: 14,
                    border: '1px solid rgba(190,170,242,0.25)',
                    padding: '16px 18px',
                  }}
                >
                  <Typography.Text strong style={{ fontSize: 15 }}>
                    {m.title}
                  </Typography.Text>
                  <div style={{ marginTop: 6 }}>
                    <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                      {m.lessons.length
                        ? m.lessons.map((l) => l.title).join(' · ')
                        : 'Уроки появятся позже'}
                    </Typography.Text>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
