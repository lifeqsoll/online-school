import { Button, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { BookOutlined, CalendarOutlined, FormOutlined } from '@ant-design/icons';
import { easeOutExpo, fadeUp, stagger } from '../../shared/motion';
import { useAuth } from '../../shared/auth/AuthContext';

const features = [
  {
    icon: <BookOutlined />,
    title: 'Уроки и материалы',
    text: 'Видео, тексты и файлы в одном месте',
  },
  {
    icon: <FormOutlined />,
    title: 'Практика с XP',
    text: 'Домашки, проверка и рост ранга',
  },
  {
    icon: <CalendarOutlined />,
    title: 'Живой календарь',
    text: 'Занятия и дедлайны по курсам',
  },
];

export function LandingPage() {
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const { user } = useAuth();

  return (
    <div style={{ overflow: 'hidden' }}>
      <section
        style={{
          minHeight: 'calc(100vh - 64px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '56px 24px 72px',
          position: 'relative',
          background:
            'radial-gradient(ellipse 90% 70% at 10% -10%, rgba(190,170,242,0.55) 0%, transparent 55%),' +
            'radial-gradient(ellipse 80% 60% at 100% 20%, rgba(148,200,255,0.45) 0%, transparent 50%),' +
            'linear-gradient(165deg, #f8f6fc 0%, #eef3fa 45%, #f4f0fb 100%)',
        }}
      >
        {!reduce ? (
          <>
            <motion.div
              aria-hidden
              animate={{ y: [0, -18, 0], rotate: [0, 4, 0] }}
              transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                width: 220,
                height: 220,
                borderRadius: '40% 60% 55% 45%',
                background: 'rgba(190,170,242,0.35)',
                filter: 'blur(2px)',
                top: '12%',
                right: '8%',
                pointerEvents: 'none',
              }}
            />
            <motion.div
              aria-hidden
              animate={{ y: [0, 14, 0], x: [0, -10, 0] }}
              transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute',
                width: 160,
                height: 160,
                borderRadius: '50%',
                background: 'rgba(148,200,255,0.4)',
                bottom: '18%',
                left: '6%',
                pointerEvents: 'none',
              }}
            />
          </>
        ) : null}

        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          style={{
            maxWidth: 820,
            margin: '0 auto',
            textAlign: 'center',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <motion.div variants={fadeUp} custom={0}>
            <Typography.Text
              style={{
                display: 'inline-block',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#6b4fb8',
                marginBottom: 18,
              }}
            >
              Онлайн-школа
            </Typography.Text>
          </motion.div>
          <motion.div variants={fadeUp} custom={1}>
            <Typography.Title
              style={{
                fontSize: 'clamp(2.8rem, 7vw, 4.2rem)',
                marginBottom: 16,
                marginTop: 0,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                color: '#1a1528',
              }}
            >
              Олимпиадная школа
            </Typography.Title>
          </motion.div>
          <motion.div variants={fadeUp} custom={2}>
            <Typography.Paragraph
              style={{
                fontSize: 'clamp(1.05rem, 2.2vw, 1.25rem)',
                maxWidth: 480,
                margin: '0 auto 32px',
                color: '#5c5670',
                lineHeight: 1.55,
              }}
            >
              Готовься к олимпиадам спокойно и по делу — курсы, практика и
              расписание в одном кабинете.
            </Typography.Paragraph>
          </motion.div>
          <motion.div variants={fadeUp} custom={3}>
            <Space size="middle" wrap style={{ justifyContent: 'center' }}>
              <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                <Button
                  type="primary"
                  size="large"
                  onClick={() => nav('/catalog')}
                  style={{
                    height: 48,
                    paddingInline: 28,
                    borderRadius: 12,
                    fontWeight: 600,
                  }}
                >
                  Смотреть каталог
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                <Button
                  size="large"
                  onClick={() => nav(user ? '/lk' : '/login')}
                  style={{
                    height: 48,
                    paddingInline: 28,
                    borderRadius: 12,
                    fontWeight: 600,
                    background: 'rgba(255,255,255,0.7)',
                    borderColor: 'rgba(190,170,242,0.5)',
                  }}
                >
                  {user ? 'В кабинет' : 'Войти'}
                </Button>
              </motion.div>
              {!user ? (
                <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                  <Button
                    size="large"
                    type="link"
                    onClick={() => nav('/login?tab=register')}
                    style={{
                      height: 48,
                      fontWeight: 600,
                      color: '#6b4fb8',
                    }}
                  >
                    Регистрация
                  </Button>
                </motion.div>
              ) : null}
            </Space>
          </motion.div>
        </motion.div>
      </section>

      <section style={{ padding: '64px 24px 80px', background: '#fff' }}>
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ duration: 0.55, ease: easeOutExpo }}
          style={{ maxWidth: 920, margin: '0 auto' }}
        >
          <Typography.Title
            level={2}
            style={{
              textAlign: 'center',
              marginBottom: 8,
              fontWeight: 750,
              letterSpacing: '-0.02em',
            }}
          >
            Всё нужное для подготовки
          </Typography.Title>
          <Typography.Paragraph
            type="secondary"
            style={{ textAlign: 'center', marginBottom: 40, fontSize: 16 }}
          >
            Один кабинет — без лишней суеты
          </Typography.Paragraph>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 20,
            }}
          >
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.4 }}
                transition={{ duration: 0.45, delay: i * 0.08, ease: easeOutExpo }}
                style={{ padding: '8px 4px' }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: 'rgba(190,170,242,0.28)',
                    color: '#6b4fb8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 18,
                    marginBottom: 14,
                  }}
                >
                  {f.icon}
                </div>
                <Typography.Text strong style={{ display: 'block', fontSize: 16, marginBottom: 6 }}>
                  {f.title}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                  {f.text}
                </Typography.Text>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>
    </div>
  );
}
