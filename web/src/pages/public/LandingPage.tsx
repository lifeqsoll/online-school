import { Button, Space, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { fadeUp, stagger } from '../../shared/motion';

export function LandingPage() {
  const nav = useNavigate();

  return (
    <div>
      <section
        style={{
          minHeight: '78vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '48px 24px 64px',
          background:
            'radial-gradient(ellipse 80% 60% at 20% 20%, #e8f3ff 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 85% 30%, #ebe4ff 0%, transparent 50%), linear-gradient(180deg, #f7f9fc 0%, #eef2f8 100%)',
        }}
      >
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          style={{ maxWidth: 860, margin: '0 auto', textAlign: 'center' }}
        >
          <motion.div variants={fadeUp} custom={0}>
            <Typography.Title
              style={{
                fontSize: 'clamp(2.4rem, 6vw, 3.6rem)',
                marginBottom: 12,
                fontWeight: 800,
                letterSpacing: '-0.02em',
              }}
            >
              Олимпиадная школа
            </Typography.Title>
          </motion.div>
          <motion.div variants={fadeUp} custom={1}>
            <Typography.Title level={3} style={{ fontWeight: 600, marginTop: 0 }}>
              Готовься к олимпиадам спокойно и по делу
            </Typography.Title>
          </motion.div>
          <motion.div variants={fadeUp} custom={2}>
            <Typography.Paragraph
              style={{ fontSize: 18, maxWidth: 520, margin: '0 auto 28px' }}
              type="secondary"
            >
              Курсы, уроки и практика — смотри каталог без регистрации, а аккаунт
              создай, когда будешь готов записаться.
            </Typography.Paragraph>
          </motion.div>
          <motion.div variants={fadeUp} custom={3}>
            <Space size="middle" wrap>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button type="primary" size="large" onClick={() => nav('/catalog')}>
                  Каталог курсов
                </Button>
              </motion.div>
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}>
                <Button size="large" onClick={() => nav('/login')}>
                  Войти
                </Button>
              </motion.div>
            </Space>
          </motion.div>
        </motion.div>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{ padding: '56px 24px', background: '#fff' }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <Typography.Title level={2}>О платформе</Typography.Title>
          <Typography.Paragraph type="secondary" style={{ fontSize: 16 }}>
            Уроки, домашние задания и календарь занятий в одном кабинете. Кураторы
            ведут расписание, а ты видишь, что и когда будет дальше.
          </Typography.Paragraph>
        </div>
      </motion.section>
    </div>
  );
}
