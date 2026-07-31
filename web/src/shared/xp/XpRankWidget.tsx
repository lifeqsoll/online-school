import { Popover, Progress, Typography } from 'antd';
import { ReadOutlined, TrophyOutlined } from '@ant-design/icons';
import { getRankProgress } from './ranks';

export function XpRankWidget({ totalXp }: { totalXp: number }) {
  const progress = getRankProgress(totalXp);
  const { current, next, percent, barMax, xpToNext } = progress;

  const content = (
    <div style={{ width: 260 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'rgba(190,170,242,0.25)',
            color: '#6b4fb8',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
          }}
        >
          <TrophyOutlined />
        </div>
        <div>
          <Typography.Text strong style={{ display: 'block', fontSize: 15 }}>
            {current.title}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {current.hint}
          </Typography.Text>
        </div>
      </div>

      <Typography.Paragraph style={{ marginBottom: 8, fontSize: 13 }}>
        Всего XP: <Typography.Text strong>{totalXp}</Typography.Text>
      </Typography.Paragraph>

      {next ? (
        <>
          <Typography.Text style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            Следующий ранг:{' '}
            <Typography.Text strong style={{ color: '#6b4fb8' }}>
              {next.title}
            </Typography.Text>
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
            {next.hint} · ещё {xpToNext} XP
          </Typography.Text>
          <Progress
            percent={percent}
            showInfo={false}
            strokeColor={{ from: '#95de64', to: '#52c41a' }}
            trailColor="#f0f0f0"
            size="small"
          />
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            {totalXp} / {next.minXp} XP до «{next.title}»
          </Typography.Text>
        </>
      ) : (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          Максимальный ранг достигнут 🎉
        </Typography.Text>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      title="Ранг"
    >
      <button
        type="button"
        aria-label={`Ранг ${current.title}, ${totalXp} из ${barMax} XP`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#fff',
          border: '1px solid #ebebeb',
          borderRadius: 999,
          padding: '6px 12px 6px 10px',
          minWidth: 148,
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: 'rgba(250, 173, 20, 0.14)',
            color: '#d48806',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <ReadOutlined />
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 8,
              lineHeight: 1.1,
            }}
          >
            <Typography.Text strong style={{ fontSize: 14 }}>
              {totalXp}
              <Typography.Text
                type="secondary"
                style={{ fontSize: 11, fontWeight: 500, marginLeft: 4 }}
              >
                XP
              </Typography.Text>
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              {totalXp}/{barMax}
            </Typography.Text>
          </div>
          <div
            style={{
              marginTop: 4,
              height: 4,
              borderRadius: 999,
              background: '#f0f0f0',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${percent}%`,
                height: '100%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, #95de64, #52c41a)',
                transition: 'width 0.35s ease',
              }}
            />
          </div>
        </div>
      </button>
    </Popover>
  );
}
