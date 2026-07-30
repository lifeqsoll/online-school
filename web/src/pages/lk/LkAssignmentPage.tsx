import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Checkbox,
  Input,
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
  maxAttempts?: number | null;
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

function normalizeOptions(
  options: Question['options'],
): { id: string; text: string }[] {
  if (!options) return [];
  if (Array.isArray(options)) return options;
  return [];
}

export function LkAssignmentPage() {
  const { assignmentId = '' } = useParams();
  const [search, setSearch] = useSearchParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const retry = search.get('retry') === '1';
  const showResultsParam = search.get('view') === 'results';

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
  const [phase, setPhase] = useState<'boot' | 'take' | 'results'>('boot');

  const draft = useMemo(
    () => mine.data?.find((s) => s.status === 'IN_PROGRESS'),
    [mine.data],
  );
  const latestDone = useMemo(() => {
    const done = (mine.data ?? []).filter((s) => s.status !== 'IN_PROGRESS');
    return done[done.length - 1];
  }, [mine.data]);

  useEffect(() => {
    if (!assignment.data || mine.data === undefined) return;
    let cancelled = false;

    (async () => {
      try {
        if (showResultsParam && latestDone && !retry) {
          if (cancelled) return;
          setSubmissionId(latestDone.id);
          setPhase('results');
          return;
        }

        if (draft && !retry) {
          if (cancelled) return;
          setSubmissionId(draft.id);
          const map: AnswersMap = {};
          for (const a of draft.answers) map[a.questionId] = a.value;
          setAnswers(map);
          setPhase('take');
          return;
        }

        if (latestDone && !retry && !showResultsParam) {
          if (cancelled) return;
          setSubmissionId(latestDone.id);
          setPhase('results');
          setSearch({ view: 'results' }, { replace: true });
          return;
        }

        // New attempt (first open or retry)
        const created = await api<Submission>(
          `/assignments/${assignmentId}/submissions`,
          { method: 'POST' },
        );
        if (cancelled) return;
        if (created.status !== 'IN_PROGRESS') {
          // Safety: never edit a finished submission
          setSubmissionId(created.id);
          setPhase('results');
          setSearch({ view: 'results' }, { replace: true });
          return;
        }
        setSubmissionId(created.id);
        const map: AnswersMap = {};
        for (const a of created.answers ?? []) map[a.questionId] = a.value;
        setAnswers(map);
        setPhase('take');
        if (retry) setSearch({}, { replace: true });
      } catch (e) {
        if (e instanceof ApiError && /max attempts|попыт/i.test(e.message)) {
          if (latestDone) {
            setSubmissionId(latestDone.id);
            setPhase('results');
            setSearch({ view: 'results' }, { replace: true });
            message.warning('Лимит попыток исчерпан — показаны последние результаты');
            return;
          }
        }
        message.error(e instanceof Error ? e.message : 'Не удалось открыть попытку');
        setPhase('results');
      }
    })();

    return () => {
      cancelled = true;
    };
    // Re-run when assignment/mine/retry/view change — not on every answer keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.data, mine.data, assignmentId, retry, showResultsParam]);

  const ensureDraftId = async (): Promise<string> => {
    if (submissionId && phase === 'take') {
      const current = mine.data?.find((s) => s.id === submissionId);
      if (!current || current.status === 'IN_PROGRESS') return submissionId;
    }
    if (draft) return draft.id;
    const created = await api<Submission>(
      `/assignments/${assignmentId}/submissions`,
      { method: 'POST' },
    );
    if (created.status !== 'IN_PROGRESS') {
      throw new Error('Нет редактируемого черновика — начните новую попытку');
    }
    setSubmissionId(created.id);
    setPhase('take');
    await qc.invalidateQueries({ queryKey: ['submissions-me', assignmentId] });
    return created.id;
  };

  const save = useMutation({
    mutationFn: async () => {
      const id = await ensureDraftId();
      const payload = Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        value,
      }));
      return api<Submission>(`/submissions/${id}`, {
        method: 'PATCH',
        json: { answers: payload },
      });
    },
    onSuccess: (s) => {
      setSubmissionId(s.id);
      message.success('Сохранено — можно продолжить позже');
      qc.invalidateQueries({ queryKey: ['submissions-me', assignmentId] });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const id = await ensureDraftId();
      const payload = Object.entries(answers).map(([questionId, value]) => ({
        questionId,
        value,
      }));
      await api(`/submissions/${id}`, {
        method: 'PATCH',
        json: { answers: payload },
      });
      return api<Submission>(`/submissions/${id}/submit`, { method: 'POST' });
    },
    onSuccess: async (s) => {
      message.success('Работа сдана');
      setSubmissionId(s.id);
      await qc.invalidateQueries({ queryKey: ['submissions-me', assignmentId] });
      setPhase('results');
      setSearch({ view: 'results' }, { replace: true });
    },
    onError: (e: Error) => message.error(e.message),
  });

  const startRetry = () => {
    setAnswers({});
    setQIndex(0);
    setSubmissionId(null);
    setPhase('boot');
    setSearch({ retry: '1' });
  };

  if (!assignment.data || phase === 'boot') {
    return <Spin style={{ margin: 48 }} />;
  }

  const questions = assignment.data.questions.map((q) => ({
    ...q,
    options: normalizeOptions(q.options),
  }));
  const current = questions[qIndex];
  const resultSub =
    phase === 'results'
      ? (mine.data?.find((s) => s.id === submissionId) ?? latestDone)
      : null;

  if (phase === 'results' && resultSub) {
    const byQ = new Map(resultSub.answers.map((a) => [a.questionId, a]));
    const totalPts = questions.reduce((s, q) => s + q.points, 0);
    const earned = resultSub.scorePoints ?? 0;

    return (
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <button type="button" onClick={() => nav(-1)} style={backBtn}>
          <ArrowLeftOutlined /> Назад
        </button>
        <Typography.Title level={2} style={{ marginTop: 16 }}>
          Результаты
        </Typography.Title>
        <Space style={{ marginBottom: 16 }} wrap>
          <Typography.Text type="secondary">
            <ClockCircleOutlined /> {statusLabel(resultSub.status)}
          </Typography.Text>
          <Typography.Text>
            <StarFilled style={{ color: '#faad14' }} /> {resultSub.scoreXp ?? 0} XP
          </Typography.Text>
        </Space>

        <div style={card}>
          <Typography.Text type="secondary">Тестирование</Typography.Text>
          <Typography.Title level={4} style={{ margin: '8px 0' }}>
            Баллы: {earned} из {totalPts}
            {totalPts ? ` / ${Math.round((earned / totalPts) * 100)}%` : ''}
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

        <Button type="primary" style={{ marginTop: 24 }} onClick={startRetry}>
          Пройти снова
        </Button>
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
          <Button type="link" onClick={() => {
            setPhase('results');
            setSearch({ view: 'results' });
          }}>
            Результаты
          </Button>
        ) : null}
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        «Сохранить» пишет черновик на сервер — после выхода ответы останутся.
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
  const options = normalizeOptions(question.options);
  const selected = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];

  if (!options.length) {
    return (
      <Typography.Text type="secondary">Варианты ответа не заданы</Typography.Text>
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
      (id) => normalizeOptions(q.options).find((o) => o.id === id)?.text ?? id,
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
