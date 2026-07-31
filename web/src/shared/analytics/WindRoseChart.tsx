import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';
import { Typography } from 'antd';
import { easeOutExpo } from '../motion';

export type WindRosePayload = {
  labels: string[];
  values: number[];
  scaleValues?: number[];
  scaleMax?: number;
};

type Props = {
  data: WindRosePayload | undefined;
  loading?: boolean;
  emptyText?: string;
  height?: number;
};

export function WindRoseChart({
  data,
  loading,
  emptyText = 'Пока нет модулей для розы ветров',
  height = 340,
}: Props) {
  const [revealed, setRevealed] = useState(0);

  const chartData = useMemo(() => {
    if (!data?.labels?.length) return [];
    const scaleMax = data.scaleMax ?? 8;
    return data.labels.map((label, i) => {
      const pct = data.values[i] ?? 0;
      const target =
        data.scaleValues?.[i] ?? Math.round((pct / 100) * scaleMax * 10) / 10;
      return {
        topic: label,
        value: target * revealed,
        fullMark: scaleMax,
      };
    });
  }, [data, revealed]);

  useEffect(() => {
    setRevealed(0);
    if (!data?.labels?.length) return;
    let frame = 0;
    const start = performance.now();
    const duration = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setRevealed(eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [data?.labels?.join('|'), data?.values?.join('|')]);

  if (loading) {
    return <Typography.Text type="secondary">Загрузка…</Typography.Text>;
  }
  if (!chartData.length) {
    return <Typography.Text type="secondary">{emptyText}</Typography.Text>;
  }

  const scaleMax = data?.scaleMax ?? 8;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35, ease: easeOutExpo }}
      style={{
        width: '100%',
        height,
        position: 'relative',
        background:
          'radial-gradient(ellipse at center, #f7f7f9 0%, #eef0f3 55%, #e8eaee 100%)',
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: '12% 18%',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(212,175,55,0.18) 0%, transparent 70%)',
          filter: 'blur(18px)',
          pointerEvents: 'none',
        }}
      />
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke="#c5c9d1" strokeOpacity={0.85} />
          <PolarAngleAxis
            dataKey="topic"
            tick={{ fill: '#595959', fontSize: 12, fontWeight: 600 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, scaleMax]}
            tickCount={scaleMax + 1}
            tick={{ fill: '#8c8c8c', fontSize: 10 }}
            axisLine={false}
          />
          <Radar
            name="Прогресс"
            dataKey="value"
            stroke="#c9a227"
            strokeWidth={2}
            fill="#d4af37"
            fillOpacity={0.55}
            isAnimationActive={false}
            style={{
              filter:
                'drop-shadow(0 0 6px rgba(80,140,220,0.55)) drop-shadow(0 0 14px rgba(212,175,55,0.35))',
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
