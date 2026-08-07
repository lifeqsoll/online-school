import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, Empty, Typography } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { api, getAccessToken } from '../../shared/api/client';
import { easeOutExpo, fadeUp, stagger } from '../../shared/motion';
import { courseColor } from '../../shared/schedule/courseColor';
import {
  CourseRatingBadge,
  CourseReviewsModal,
} from '../../shared/reviews/CourseReviewsModal';

type Course = {
  id: string;
  title: string;
  description?: string | null;
  priceCents: number;
  isPublished: boolean;
  coverUrl?: string | null;
  ratingAvg?: number;
  ratingCount?: number;
};

export function CatalogPage() {
  const [freeOnly, setFreeOnly] = useState(false);
  const [reviewsFor, setReviewsFor] = useState<Course | null>(null);
  const reduce = useReducedMotion();
  const q = useQuery({
    queryKey: ['courses', 'public'],
    queryFn: () =>
      api<Course[]>('/courses', {
        auth: getAccessToken() ? true : false,
      }),
  });

  const rows = (q.data ?? []).filter((c) => !freeOnly || c.priceCents === 0);

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 140px)',
        background:
          'radial-gradient(ellipse 70% 40% at 50% 0%, rgba(190,170,242,0.22), transparent 60%),' +
          '#f7f6fb',
        padding: '40px 24px 64px',
      }}
    >
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <motion.div initial="hidden" animate="visible" variants={stagger}>
          <motion.div
            variants={fadeUp}
            custom={0}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 16,
              marginBottom: 28,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <Typography.Text
                style={{
                  display: 'block',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#6b4fb8',
                  marginBottom: 8,
                }}
              >
                Курсы
              </Typography.Text>
              <Typography.Title
                level={2}
                style={{ margin: 0, fontWeight: 800, letterSpacing: '-0.02em' }}
              >
                Каталог
              </Typography.Title>
              <Typography.Paragraph
                type="secondary"
                style={{ margin: '8px 0 0', maxWidth: 420 }}
              >
                Выбери курс — смотреть программу можно без регистрации
              </Typography.Paragraph>
            </div>
            <Checkbox
              checked={freeOnly}
              onChange={(e) => setFreeOnly(e.target.checked)}
              style={{
                background: '#fff',
                padding: '8px 14px',
                borderRadius: 999,
                border: '1px solid rgba(190,170,242,0.35)',
              }}
            >
              Только бесплатные
            </Checkbox>
          </motion.div>

          {!rows.length && !q.isLoading ? (
            <motion.div variants={fadeUp} custom={1}>
              <Empty description="Пока нет опубликованных курсов" />
            </motion.div>
          ) : (
            <motion.div
              layout
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: 18,
              }}
            >
              <AnimatePresence mode="popLayout">
                {rows.map((c, i) => {
                  const colors = courseColor(c.id);
                  const free = c.priceCents === 0;
                  const hasCover = !!c.coverUrl;
                  return (
                    <motion.div
                      key={c.id}
                      layout
                      initial={reduce ? false : { opacity: 0, y: 22, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{
                        duration: 0.4,
                        delay: reduce ? 0 : Math.min(i, 8) * 0.05,
                        ease: easeOutExpo,
                      }}
                      whileHover={
                        reduce
                          ? undefined
                          : {
                              y: -6,
                              boxShadow: '0 16px 40px rgba(80, 60, 120, 0.14)',
                            }
                      }
                      style={{
                        borderRadius: 18,
                        overflow: 'hidden',
                        background: hasCover
                          ? `#1a1525 url(${c.coverUrl}) center/cover no-repeat`
                          : '#fff',
                        border: hasCover
                          ? '1px solid rgba(0,0,0,0.08)'
                          : '1px solid rgba(190,170,242,0.28)',
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 240,
                        position: 'relative',
                      }}
                    >
                      {!hasCover ? (
                        <div
                          style={{
                            height: 8,
                            background: `linear-gradient(90deg, ${colors.border}, ${colors.bg})`,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                              'linear-gradient(180deg, rgba(20,16,32,0.25) 0%, rgba(20,16,32,0.55) 45%, rgba(12,10,20,0.88) 100%)',
                            pointerEvents: 'none',
                          }}
                        />
                      )}
                      <div
                        style={{
                          padding: '20px 20px 18px',
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          position: 'relative',
                          zIndex: 1,
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            gap: 10,
                            marginBottom: 10,
                          }}
                        >
                          <Typography.Title
                            level={4}
                            style={{
                              margin: 0,
                              fontSize: 18,
                              fontWeight: 700,
                              letterSpacing: '-0.01em',
                              color: hasCover ? '#fff' : undefined,
                            }}
                          >
                            {c.title}
                          </Typography.Title>
                          <span
                            style={{
                              flexShrink: 0,
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
                              height: 'fit-content',
                              backdropFilter: hasCover ? 'blur(6px)' : undefined,
                            }}
                          >
                            {free
                              ? 'Бесплатно'
                              : `${(c.priceCents / 100).toFixed(0)} ₽`}
                          </span>
                        </div>
                        <Typography.Paragraph
                          ellipsis={{ rows: 3 }}
                          style={{
                            flex: 1,
                            marginBottom: 16,
                            fontSize: 14,
                            color: hasCover
                              ? 'rgba(255,255,255,0.78)'
                              : 'rgba(0,0,0,0.45)',
                          }}
                        >
                          {c.description || 'Описание скоро появится'}
                        </Typography.Paragraph>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Link to={`/courses/${c.id}`} style={{ alignSelf: 'flex-start' }}>
                            <motion.div whileHover={{ x: 3 }} whileTap={{ scale: 0.98 }}>
                              <Button
                                type="primary"
                                style={{
                                  borderRadius: 10,
                                  fontWeight: 600,
                                  ...(hasCover
                                    ? {
                                        background: 'rgba(255,255,255,0.95)',
                                        color: '#3d2a7a',
                                        borderColor: 'transparent',
                                      }
                                    : {}),
                                }}
                              >
                                Подробнее <ArrowRightOutlined />
                              </Button>
                            </motion.div>
                          </Link>
                          <CourseRatingBadge
                            avg={c.ratingAvg}
                            count={c.ratingCount}
                            light={hasCover}
                            onClick={() => setReviewsFor(c)}
                          />
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          )}
        </motion.div>
      </div>

      <CourseReviewsModal
        courseId={reviewsFor?.id ?? ''}
        courseTitle={reviewsFor?.title}
        open={!!reviewsFor}
        onClose={() => setReviewsFor(null)}
      />
    </div>
  );
}
