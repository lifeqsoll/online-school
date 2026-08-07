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
import { assignmentTypeLabel } from '../../shared/assignments/labels';
import { FileList, FileUploadButton } from '../../shared/files/FileList';

type Question = {
  id: string;
  type: 'CHOICE' | 'SHORT' | 'OPEN';
  prompt: string;
  points: number;
  options?: { id: string; text: string }[] | null;
  allowMultiple?: boolean;
  maxAnswerLength?: number | null;
};

type Assignment = {
  id: string;
  title: string;
  courseId: string;
  maxXp: number;
  maxAttempts?: number | null;
  description?: string | null;
  responseMode?: 'QUIZ' | 'FILE' | 'QUIZ_AND_FILE';
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
  /** Last answers successfully written to the server (draft). */
  const [savedAnswers, setSavedAnswers] = useState<AnswersMap>({});
  const [qIndex, setQIndex] = useState(0);
  const [phase, setPhase] = useState<'boot' | 'take' | 'results' | 'error'>('boot');

  const draft = useMemo(
    () => mine.data?.find((s) => s.status === 'IN_PROGRESS'),
    [mine.data],
  );
  const latestDone = useMemo(() => {
    const done = (mine.data ?? [])
      .filter((s) => s.status !== 'IN_PROGRESS')
      .sort((a, b) => a.attemptNo - b.attemptNo);
    return done[done.length - 1];
  }, [mine.data]);

  // Already graded/submitted → always results (ignore leftover empty drafts from old "retry")
  useEffect(() => {
    if (assignment.isError || mine.isError) {
      setPhase('error');
      return;
    }
    if (!assignment.data || mine.data === undefined) return;

    if (latestDone) {
      setSubmissionId(latestDone.id);
      setPhase('results');
      if (!showResultsParam) {
        setSearch({ view: 'results' }, { replace: true });
      }
      return;
    }

    if (draft) {
      setSubmissionId(draft.id);
      const map: AnswersMap = {};
      for (const a of draft.answers) map[a.questionId] = a.value;
      setAnswers(map);
      setSavedAnswers(map);
      setPhase('take');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const created = await api<Submission>(
          `/assignments/${assignmentId}/submissions`,
          { method: 'POST' },
        );
        if (cancelled) {
          // StrictMode/remount: let the next effect pick up the draft via refetch
          void qc.invalidateQueries({
            queryKey: ['submissions-me', assignmentId],
          });
          return;
        }
        if (created.status !== 'IN_PROGRESS') {
          setSubmissionId(created.id);
          setPhase('results');
          setSearch({ view: 'results' }, { replace: true });
          return;
        }
        setSubmissionId(created.id);
        const map: AnswersMap = {};
        for (const a of created.answers ?? []) map[a.questionId] = a.value;
        setAnswers(map);
        setSavedAnswers(map);
        setPhase('take');
        void qc.invalidateQueries({
          queryKey: ['submissions-me', assignmentId],
        });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && /max attempts|попыт/i.test(e.message)) {
          try {
            const subs = await api<Submission[]>(
              `/assignments/${assignmentId}/submissions/me`,
            );
            const done = (Array.isArray(subs) ? subs : [])
              .filter((s) => s.status !== 'IN_PROGRESS')
              .sort((a, b) => a.attemptNo - b.attemptNo);
            const last = done[done.length - 1];
            if (last) {
              setSubmissionId(last.id);
              setPhase('results');
              setSearch({ view: 'results' }, { replace: true });
              void qc.invalidateQueries({
                queryKey: ['submissions-me', assignmentId],
              });
              return;
            }
          } catch {
            /* fall through */
          }
          message.warning('Лимит попыток исчерпан');
          setPhase('error');
          return;
        }
        message.error(e instanceof Error ? e.message : 'Не удалось открыть попытку');
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment.data, assignment.isError, mine.data, mine.isError, assignmentId, latestDone?.id, draft?.id]);

  const ensureDraftId = async (): Promise<string> => {
    if (latestDone) {
      throw new Error('Работа уже сдана — новая попытка недоступна');
    }
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
      throw new Error('Нет редактируемого черновика');
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
      const map: AnswersMap = {};
      for (const a of s.answers ?? []) map[a.questionId] = a.value;
      // Prefer server snapshot; fall back to what we just sent
      setSavedAnswers(Object.keys(map).length ? map : { ...answers });
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

  if (assignment.isError || phase === 'error') {
    return (
      <div style={{ margin: 48 }}>
        <Button type="link" onClick={() => nav(-1)}>
          ← Назад
        </Button>
        <Typography.Paragraph type="danger">
          Не удалось открыть задание. Попробуйте позже или вернитесь к списку ДЗ.
        </Typography.Paragraph>
      </div>
    );
  }

  if (!assignment.data || phase === 'boot' || mine.isLoading) {
    return <Spin style={{ margin: 48 }} />;
  }

  const questions = assignment.data.questions.map((q) => ({
    ...q,
    options: normalizeOptions(q.options),
  }));
  const mode = assignment.data.responseMode ?? 'QUIZ';
  const needsFile = mode === 'FILE' || mode === 'QUIZ_AND_FILE';
  const showQuiz = mode === 'QUIZ' || mode === 'QUIZ_AND_FILE';
  const current = questions[qIndex];
  const currentSaveStatus = current
    ? questionSaveStatus(answers[current.id], savedAnswers[current.id])
    : 'empty';
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
          <Typography.Text type="secondary">
            {assignmentTypeLabel(
              assignment.data.responseMode,
              assignment.data.questions,
            )}
          </Typography.Text>
          <Typography.Title level={4} style={{ margin: '8px 0' }}>
            Баллы: {earned} из {totalPts}
            {totalPts ? ` / ${Math.round((earned / totalPts) * 100)}%` : ''}
          </Typography.Title>
          {resultSub.status === 'PENDING_REVIEW' ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Учтены баллы автопроверки. Развёрнутые ответы ещё на проверке —
              итоговый результат и XP обновятся после оценки куратора.
            </Typography.Paragraph>
          ) : null}
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

      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          Материалы задания
        </Typography.Title>
        <FileList
          ownerType="ASSIGNMENT_MATERIAL"
          ownerId={assignment.data.id}
          canDelete={false}
        />
      </div>

      {needsFile && submissionId ? (
        <div style={{ marginBottom: 20 }}>
          <Typography.Title level={5}>Ваш файл ответа (PNG/PDF)</Typography.Title>
          <FileUploadButton
            ownerType="SUBMISSION_ATTACHMENT"
            ownerId={submissionId}
            label="Прикрепить файл"
          />
          <div style={{ marginTop: 8 }}>
            <FileList ownerType="SUBMISSION_ATTACHMENT" ownerId={submissionId} />
          </div>
        </div>
      ) : null}

      {showQuiz && questions.length > 0 ? (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {questions.map((q, i) => {
          const status = questionSaveStatus(answers[q.id], savedAnswers[q.id]);
          const active = i === qIndex;
          let border = '2px solid #d9d9d9';
          let background = '#fff';
          let color = '#595959';
          if (active) {
            border =
              status === 'saved'
                ? '2px solid #52c41a'
                : status === 'draft'
                  ? '2px solid #fa8c16'
                  : '2px solid var(--accent)';
            background = 'var(--accent)';
            color = '#fff';
          } else if (status === 'saved') {
            border = '2px solid #52c41a';
            background = '#f6ffed';
            color = '#389e0d';
          } else if (status === 'draft') {
            border = '2px solid #fa8c16';
            background = '#fff7e6';
            color = '#d46b08';
          }
          return (
            <button
              key={q.id}
              type="button"
              title={
                status === 'saved'
                  ? 'Сохранено на сервере'
                  : status === 'draft'
                    ? 'Есть ответ, но ещё не сохранено'
                    : 'Пока без ответа'
              }
              onClick={() => setQIndex(i)}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                border,
                background,
                color,
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      ) : null}
      {showQuiz && questions.length > 0 ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16, fontSize: 12 }}>
          Зелёный номер — ответ сохранён · оранжевый — есть правки, нажмите «Сохранить»
        </Typography.Paragraph>
      ) : null}

      {showQuiz && current ? (
        <div
          style={{
            ...card,
            border:
              currentSaveStatus === 'saved'
                ? '1px solid #52c41a'
                : currentSaveStatus === 'draft'
                  ? '1px solid #fa8c16'
                  : '1px solid #ebebeb',
            background:
              currentSaveStatus === 'saved'
                ? '#f6ffed'
                : currentSaveStatus === 'draft'
                  ? '#fff7e6'
                  : '#fff',
          }}
        >
          <Typography.Text type="secondary">
            Вопрос №{qIndex + 1} · {current.points} б.
            {currentSaveStatus === 'saved'
              ? ' · сохранено'
              : currentSaveStatus === 'draft'
                ? ' · не сохранено'
                : ''}
          </Typography.Text>
          <Typography.Paragraph
            strong
            style={{
              fontSize: 16,
              marginTop: 8,
              maxWidth: '100%',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
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
              maxLength={500}
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
              maxLength={current.maxAnswerLength ?? 500}
              showCount
            />
          ) : null}
        </div>
      ) : null}

      {mode === 'FILE' ? (
        <Typography.Paragraph type="secondary">
          Прикрепите файл выше и нажмите «Сдать».
        </Typography.Paragraph>
      ) : null}

      <Space style={{ marginTop: 20 }} wrap>
        {showQuiz ? (
          <>
            <Button disabled={qIndex === 0} onClick={() => setQIndex((i) => i - 1)}>
              Назад
            </Button>
            <Button
              disabled={qIndex >= questions.length - 1}
              onClick={() => setQIndex((i) => i + 1)}
            >
              Далее
            </Button>
          </>
        ) : null}
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Сохранить
        </Button>
        <Button type="primary" loading={submit.isPending} onClick={() => submit.mutate()}>
          Сдать работу
        </Button>
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
        «Сохранить» пишет черновик на сервер — после выхода ответы останутся.
      </Typography.Paragraph>
    </div>
  );
}

function hasAnswerValue(value: unknown): boolean {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim().length > 0;
}

function sameAnswer(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** empty | draft (local only) | saved (matches server snapshot) */
function questionSaveStatus(
  current: unknown,
  saved: unknown,
): 'empty' | 'draft' | 'saved' {
  if (!hasAnswerValue(current)) return 'empty';
  if (hasAnswerValue(saved) && sameAnswer(current, saved)) return 'saved';
  return 'draft';
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
  const selected = Array.isArray(value)
    ? (value as string[])
    : value
      ? [String(value)]
      : [];
  const multi = !!question.allowMultiple;

  if (!options.length) {
    return (
      <Typography.Text type="secondary">Варианты ответа не заданы</Typography.Text>
    );
  }

  if (!multi) {
    return (
      <Radio.Group
        value={selected[0]}
        onChange={(e) => onChange(e.target.value ? [String(e.target.value)] : [])}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {options.map((o) => (
          <Radio key={o.id} value={o.id} style={{ whiteSpace: 'normal' }}>
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
        <Checkbox key={o.id} value={o.id} style={{ whiteSpace: 'normal' }}>
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
