import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  Input,
  Radio,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import { ArrowLeftOutlined, StarFilled, ClockCircleOutlined } from '@ant-design/icons';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../shared/api/client';

type Question = {
  id: string;
  type: 'CHOICE' | 'SHORT' | 'OPEN';
  prompt: string;
  points: number;
  options?: { id: string; text: string }[] | null;
};

type Assignment = {
  id: string;
  title: string;
  courseId: string;
  maxXp: number;
  description?: string | null;
  questions: Question[];
};

type AnswerRow = {
  questionId: string;
  value: unknown;
  isCorrect?: boolean | null;
  pointsAwarded?: number | null;
};

type Submission = {
  id: string;
  status: string;
  attemptNo: number;
  scorePoints?: number | null;
  scoreXp?: number | null;
  submittedAt?: string | null;
  answers: AnswerRow[];
};

type AnswersMap = Record<string, unknown>;

export function LkAssignmentPage() {
  const { assignmentId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const showResults = search.get('view') === 'results';

  const assignment = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => api<Assignment>(`/assignments/${assignmentId}`),
    enabled: !!assignmentId,
  });

  const mine = useQuery({
    queryKey: ['submissions-me', assignmentId],
    queryFn: () => api<Submission[]>(`/assignments/${assignmentId}/submissions/me`),
    enabled: !!assignmentId,
  });

  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [qIndex, setQIndex] = useState(0);
  const [ready, setReady] = useState(false);

  const draft = useMemo(
    () => mine.data?.find((s) => s.status === 'IN_PROGRESS'),
    [mine.data],
  );
  const latestDone = useMemo(() => {
    const done = (mine.data ?? []).filter((s) => s.status !== 'IN_PROGRESS');
    return done[done.length - 1];
  }, [mine.data]);

  useEffect(() => {
    if (!assignment.data || !mine.data || ready) return;
    let cancelled = false;

    (async () => {
      try {
        if (showResults && latestDone) {
          setSubmissionId(latestDone.id);
          setReady(true);
          return;
        }
        if (draft) {
          setSubmissionId(draft.id);
          const map: AnswersMap = {};
          for (const a of draft.answers) map[a.questionId] = a.value;
          setAnswers(map);
          setReady(true);
          return;
        }
        if (latestDone && search.get('retry') !== '1') {
          setSubmissionId(latestDone.id);
          setSearch({ view: 'results' });
          setReady(true);
          return;
        }
        const created = await api<Submission>(
          `/assignments/${assignmentId}/submissions`,
          { method: 'POST' },
        );
        if (cancelled) return;
        setSubmissionId(created.id);
        const map: AnswersMap = {};
        for (const a of created.answers ?? []) map[a.questionId] = a.value;
        setAnswers(map);
        setReady(true);
      } catch (e) {
        if (e instanceof ApiError && e.message.includes('Max attempts')) {
          if (latestDone) {
            setSearch({ view: 'results' });
            setSubmissionId(latestDone.id);
            setReady(true);
            return;
          }
        }
        message.error(e instanceof Error ? e.message : 'Не удалось открыть попытку');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    assignment.data,
    mine.data,
    draft,
    latestDone,
    assignmentId,
    ready,
    showResults,
    setSearch,
    search,
  ]);

  const save = useMutation({
    mutationFn: async () => {
      if (!submissionId) throw new Error('Нет черновика');
      const payload = Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        value,
      }));
      return api<Submission>(`/submissions/${submissionId}`, {
        method: 'PATCH',
        json: { answers: payload },
      });
    },
    onSuccess: () => {
      message.success('Сохранено — можно продолжить позже');
      qc.invalidateQueries({ queryKey: ['submissions-me', assignmentId] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!submissionId) throw new Error('Нет черновика');
      const payload = Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        value,
      }));
      await api(`/submissions/${submissionId}`, {
        method: 'PATCH',
        json: { answers: payload },
      });
      return api<Submission>(`/submissions/${submissionId}/submit`, {
        method: 'POST',
      });
    },
    onSuccess: async () => {
      message.success('Работа сдана');
      await qc.invalidateQueries({ queryKey: ['submissions-me', assignmentId] });
      setReady(false);
      setSearch({ view: 'results' });
    },
    onError: (e: Error) => message.error(e.message),
  });

  if (!assignment.data || !ready) {
    return <Spin style={{ margin: 48 }} />;
  }

  const questions = assignment.data.questions;
  const current = questions[qIndex];
  const resultSub =
    showResults
      ? (mine.data?.find((s) => s.id === submissionId) ?? latestDone)
      : null;

  if (showResults && resultSub) {
    const byQ = new Map(resultSub.answers.map((a) => [a.questionId, a]));
    const totalPts = questions.reduce((s, q) => s + q.points, 0);
    const earned = resultSub.scorePoints ?? 0;

    return (
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <button type="button" onClick={() => nav(-1)} style={backBtn}>
          <ArrowLeftOutlined /> Назад
        </button>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
          {questions.map((q, i) => {
            const a = byQ.get(q.id);
            const ok = a?.isCorrect;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setQIndex(i)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: `2px solid ${ok === false ? '#ff7875' : '#73d13d'}`,
                  background: i === qIndex ? 'var(--accent)' : '#fff',
                  color: i === qIndex ? '#fff' : '#333',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <Typography.Title level={2}>Результаты</Typography.Title>
        <Space style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary">
            <ClockCircleOutlined /> Статус: {statusLabel(resultSub.status)}
          </Typography.Text>
          <Typography.Text>
            <StarFilled style={{ color: '#faad14' }} /> Получено{' '}
            {resultSub.scoreXp ?? 0} XP
          </Typography.Text>
        </Space>

        <div style={card}>
          <Typography.Text type="secondary">Тестирование</Typography.Text>
          <Typography.Title level={4} style={{ margin: '8px 0' }}>
            Баллы: {earned} из {totalPts}
            {totalPts
              ? ` / ${Math.round((earned / totalPts) * 100)}%`
              : ''}
          </Typography.Title>
        </div>

        {questions.map((q, i) => {
          const a = byQ.get(q.id);
          const ok = a?.isCorrect;
          const pending = resultSub.status === 'PENDING_REVIEW' && q.type === 'OPEN';
          return (
            <div key={q.id} style={{ marginTop: 24 }}>
              <Typography.Text type="secondary">Вопрос №{i + 1}</Typography.Text>
              <Typography.Paragraph strong>{q.prompt}</Typography.Paragraph>
              <div
                style={{
                  background: pending
                    ? '#fff7e6'
                    : ok
                      ? '#73d13d'
                      : ok === false
                        ? '#ff7875'
                        : '#f0f0f0',
                  color: pending || ok == null ? '#333' : '#fff',
                  borderRadius: '10px 10px 0 0',
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  {pending ? 'На проверке' : ok ? 'Верно!' : ok === false ? 'Неверно' : '—'}
                </span>
                <span>
                  Баллы: {a?.pointsAwarded ?? 0} из {q.points}
                </span>
              </div>
              <div
                style={{
                  border: `2px solid ${pending ? '#ffc069' : ok ? '#73d13d' : ok === false ? '#ff7875' : '#ebebeb'}`,
                  borderTop: 'none',
                  borderRadius: '0 0 10px 10px',
                  padding: 12,
                  background: '#fff',
                }}
              >
                {formatAnswer(q, a?.value)}
              </div>
            </div>
          );
        })}

        {latestDone ? (
          <Button
            type="link"
            onClick={() => {
              setSearch({ retry: '1' });
              setReady(false);
              setAnswers({});
              setQIndex(0);
            }}
          >
            Новая попытка
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => nav(`/lk/courses/${assignment.data.courseId}?tab=hw`)}
          style={backBtn}
        >
          <ArrowLeftOutlined /> Назад
        </button>
        <Typography.Title level={4} style={{ margin: 0, flex: 1 }}>
          {assignment.data.title}
        </Typography.Title>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {questions.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => setQIndex(i)}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              border: '2px solid #73d13d',
              background: i === qIndex ? 'var(--accent)' : '#fff',
              color: i === qIndex ? '#fff' : '#333',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {current ? (
        <div style={card}>
          <Typography.Text type="secondary">
            Вопрос №{qIndex + 1} · {current.points} б.
          </Typography.Text>
          <Typography.Paragraph strong style={{ fontSize: 16, marginTop: 8 }}>
            {current.prompt}
          </Typography.Paragraph>

          {current.type === 'CHOICE' ? (
            <ChoiceInput
              question={current}
              value={answers[current.id]}
              onChange={(v) => setAnswers((prev) => ({ ...prev, [current.id]: v }))}
            />
          ) : null}
          {current.type === 'SHORT' ? (
            <Input
              value={String(answers[current.id] ?? '')}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }))
              }
              placeholder="Ваш ответ"
              size="large"
            />
          ) : null}
          {current.type === 'OPEN' ? (
            <Input.TextArea
              rows={5}
              value={String(answers[current.id] ?? '')}
              onChange={(e) =>
                setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }))
              }
              placeholder="Развёрнутый ответ"
            />
          ) : null}
        </div>
      ) : null}

      <Space style={{ marginTop: 20 }} wrap>
        <Button disabled={qIndex === 0} onClick={() => setQIndex((i) => i - 1)}>
          Назад
        </Button>
        <Button
          disabled={qIndex >= questions.length - 1}
          onClick={() => setQIndex((i) => i + 1)}
        >
          Далее
        </Button>
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить
        </Button>
        <Button type="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
          Сдать работу
        </Button>
        {latestDone ? (
          <Button type="link" onClick={() => setSearch({ view: 'results' })}>
            Результаты
          </Button>
        ) : null}
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        «Сохранить» записывает черновик на сервер — после выхода ответы останутся.
      </Typography.Paragraph>
    </div>
  );
}

function ChoiceInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (v: string[]) => void;
}) {
  const options = question.options ?? [];
  const selected = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
  const multi = true;

  if (!multi) {
    return (
      <Radio.Group
        value={selected[0]}
        onChange={(e) => onChange([e.target.value])}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {options.map((o) => (
          <Radio key={o.id} value={o.id}>
            {o.text}
          </Radio>
        ))}
      </Radio.Group>
    );
  }

  return (
    <Checkbox.Group
      value={selected}
      onChange={(v) => onChange(v as string[])}
      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {options.map((o) => (
        <Checkbox key={o.id} value={o.id}>
          {o.text}
        </Checkbox>
      ))}
    </Checkbox.Group>
  );
}

function formatAnswer(q: Question, value: unknown) {
  if (value == null || value === '') return '—';
  if (q.type === 'CHOICE') {
    const ids = Array.isArray(value) ? (value as string[]) : [String(value)];
    const labels = ids.map(
      (id) => q.options?.find((o) => o.id === id)?.text ?? id,
    );
    return labels.join(', ');
  }
  return String(value);
}

function statusLabel(s: string) {
  if (s === 'AUTO_GRADED') return 'проверено автоматически';
  if (s === 'PENDING_REVIEW') return 'на проверке куратора';
  if (s === 'GRADED') return 'проверено';
  return s;
}

const card: CSSProperties = {
  background: '#fff',
  border: '1px solid #ebebeb',
  borderRadius: 14,
  padding: 16,
};

const backBtn: CSSProperties = {
  border: '1px solid #ebebeb',
  background: '#fff',
  borderRadius: 10,
  padding: '6px 12px',
  cursor: 'pointer',
};
