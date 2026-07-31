import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
  Card,
  List,
  Radio,
  Checkbox,
  message,
  Divider,
  Switch,
  Modal,
  Tag,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../shared/api/client';
import {
  assignmentTypeLabel,
  responseModeSelectLabel,
} from '../../shared/assignments/labels';
import { FileList, FileUploadButton } from '../../shared/files/FileList';

type QType = 'CHOICE' | 'SHORT' | 'OPEN';

type DraftQuestion = {
  key: string;
  type: QType;
  prompt: string;
  points: number;
  options?: { id: string; text: string }[];
  correctKeys?: string[];
  shortMatch?: 'EXACT' | 'NUMBER';
  numberTolerance?: number;
};

type ModuleOpt = {
  id: string;
  title: string;
  lessons: { id: string; title: string }[];
};

type SaveMode = 'draft' | 'publish' | 'autosave';

export function AssignmentConstructor({
  courseId,
  modules,
}: {
  courseId: string;
  modules: ModuleOpt[];
}) {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['assignments', courseId],
    queryFn: () =>
      api<
        Array<{
          id: string;
          title: string;
          scope: string;
          isPublished: boolean;
          responseMode?: string;
          questions?: Array<{ type: string; prompt?: string }>;
        }>
      >(`/courses/${courseId}/assignments`),
  });

  const [scope, setScope] = useState<'LESSON' | 'MODULE' | 'COURSE'>('LESSON');
  const [lessonId, setLessonId] = useState<string>();
  const [moduleId, setModuleId] = useState<string>();
  const [title, setTitle] = useState('Новое задание');
  const [maxXp, setMaxXp] = useState(100);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
  const [published, setPublished] = useState(false);
  const [responseMode, setResponseMode] = useState<
    'QUIZ' | 'FILE' | 'QUIZ_AND_FILE'
  >('QUIZ');
  const [materialsFor, setMaterialsFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    {
      key: 'q1',
      type: 'CHOICE',
      prompt: 'Выберите верный ответ',
      points: 5,
      options: [
        { id: 'a', text: 'Вариант A' },
        { id: 'b', text: 'Вариант B' },
      ],
      correctKeys: ['a'],
    },
  ]);
  const [active, setActive] = useState('q1');

  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const skipAutosaveRef = useRef(false);
  const editingIdRef = useRef<string | null>(null);
  const publishedRef = useRef(false);
  editingIdRef.current = editingId;
  publishedRef.current = published;

  const markDirty = () => {
    if (skipAutosaveRef.current) return;
    dirtyRef.current = true;
  };

  const lessons = useMemo(
    () => modules.flatMap((m) => m.lessons.map((l) => ({ ...l, moduleTitle: m.title }))),
    [modules],
  );

  const current = questions.find((q) => q.key === active) ?? questions[0];

  const totalPoints = questions.reduce((s, q) => s + (q.points || 0), 0);

  const addQuestion = (type: QType) => {
    const key = `q${Date.now()}`;
    const base: DraftQuestion = {
      key,
      type,
      prompt: type === 'OPEN' ? 'Развёрнутый ответ' : 'Вопрос',
      points: type === 'OPEN' ? 10 : 5,
    };
    if (type === 'CHOICE') {
      base.options = [
        { id: 'a', text: 'Вариант A' },
        { id: 'b', text: 'Вариант B' },
      ];
      base.correctKeys = ['a'];
    }
    if (type === 'SHORT') {
      base.correctKeys = ['42'];
      base.shortMatch = 'NUMBER';
      base.numberTolerance = 0;
    }
    setQuestions((qs) => [...qs, base]);
    setActive(key);
    markDirty();
  };

  const resetDraft = () => {
    skipAutosaveRef.current = true;
    dirtyRef.current = false;
    setEditingId(null);
    setTitle('Новое задание');
    setMaxXp(100);
    setMaxAttempts(null);
    setPublished(false);
    setResponseMode('QUIZ');
    setScope('LESSON');
    setLessonId(undefined);
    setModuleId(undefined);
    setSaveHint(null);
    const key = `q${Date.now()}`;
    setQuestions([
      {
        key,
        type: 'CHOICE',
        prompt: 'Выберите верный ответ',
        points: 5,
        options: [
          { id: 'a', text: 'Вариант A' },
          { id: 'b', text: 'Вариант B' },
        ],
        correctKeys: ['a'],
      },
    ]);
    setActive(key);
    setTimeout(() => {
      skipAutosaveRef.current = false;
    }, 0);
  };

  const loadAssignment = async (id: string) => {
    try {
      skipAutosaveRef.current = true;
      const a = await api<{
        id: string;
        title: string;
        scope: 'LESSON' | 'MODULE' | 'COURSE';
        lessonId?: string | null;
        moduleId?: string | null;
        maxXp: number;
        maxAttempts?: number | null;
        isPublished: boolean;
        responseMode?: 'QUIZ' | 'FILE' | 'QUIZ_AND_FILE';
        questions: Array<{
          id: string;
          type: QType;
          prompt: string;
          points: number;
          options?: { id: string; text: string }[] | null;
          correctKeys?: string[] | null;
          shortMatch?: 'EXACT' | 'NUMBER' | null;
          numberTolerance?: number | null;
        }>;
      }>(`/assignments/${id}`);
      setEditingId(a.id);
      setTitle(a.title);
      setScope(a.scope);
      setLessonId(a.lessonId ?? undefined);
      setModuleId(a.moduleId ?? undefined);
      setMaxXp(a.maxXp);
      setMaxAttempts(a.maxAttempts ?? null);
      setPublished(a.isPublished);
      setResponseMode(a.responseMode ?? 'QUIZ');
      const qs: DraftQuestion[] =
        a.questions.length > 0
          ? a.questions.map((q) => ({
              key: q.id,
              type: q.type,
              prompt: q.prompt,
              points: q.points,
              options: q.options ?? undefined,
              correctKeys: q.correctKeys ?? undefined,
              shortMatch: q.shortMatch ?? undefined,
              numberTolerance: q.numberTolerance ?? undefined,
            }))
          : [
              {
                key: `q${Date.now()}`,
                type: 'CHOICE',
                prompt: 'Выберите верный ответ',
                points: 5,
                options: [
                  { id: 'a', text: 'Вариант A' },
                  { id: 'b', text: 'Вариант B' },
                ],
                correctKeys: ['a'],
              },
            ];
      setQuestions(qs);
      setActive(qs[0].key);
      setMaterialsFor(a.id);
      dirtyRef.current = false;
      setSaveHint(a.isPublished ? 'Опубликовано' : 'Черновик на сервере');
      message.success('Задание открыто для редактирования');
      setTimeout(() => {
        skipAutosaveRef.current = false;
      }, 0);
    } catch (e) {
      skipAutosaveRef.current = false;
      message.error(e instanceof Error ? e.message : 'Не удалось открыть');
    }
  };

  const buildQuestionsPayload = () =>
    responseMode === 'FILE'
      ? []
      : questions.map((q, i) => ({
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          sortOrder: i,
          options: q.type === 'CHOICE' ? q.options : undefined,
          correctKeys: q.type === 'OPEN' ? undefined : q.correctKeys,
          shortMatch: q.type === 'SHORT' ? q.shortMatch : undefined,
          numberTolerance:
            q.type === 'SHORT' && q.shortMatch === 'NUMBER'
              ? q.numberTolerance ?? 0
              : undefined,
        }));

  const canPersist = () => {
    if (!title.trim()) return false;
    if (responseMode !== 'FILE' && questions.length === 0) return false;
    if (scope === 'LESSON' && !lessonId) return false;
    if (scope === 'MODULE' && !moduleId) return false;
    return true;
  };

  const persist = async (mode: SaveMode) => {
    if (savingRef.current) return false;
    if (!canPersist()) {
      if (mode !== 'autosave') {
        if (!title.trim()) message.error('Укажите название');
        else if (scope === 'LESSON' && !lessonId) message.error('Выберите урок');
        else if (scope === 'MODULE' && !moduleId) message.error('Выберите модуль');
        else message.error('Добавьте хотя бы один вопрос');
      }
      return false;
    }

    const nextPublished =
      mode === 'publish'
        ? true
        : mode === 'draft'
          ? false
          : editingIdRef.current
            ? publishedRef.current
            : false;

    savingRef.current = true;
    setSaving(true);
    if (mode === 'autosave') setSaveHint('Сохранение черновика…');

    try {
      const id = editingIdRef.current;
      if (id) {
        await api(`/assignments/${id}`, {
          method: 'PATCH',
          json: {
            title,
            maxXp,
            maxAttempts,
            isPublished: nextPublished,
            responseMode,
          },
        });
        try {
          await api(`/assignments/${id}/questions`, {
            method: 'PUT',
            json: { questions: buildQuestionsPayload() },
          });
        } catch (e) {
          if (mode !== 'autosave') {
            message.warning(
              e instanceof Error
                ? `${e.message} (метаданные сохранены)`
                : 'Вопросы не обновлены — возможно, уже есть сдачи',
            );
          }
        }
        setPublished(nextPublished);
        dirtyRef.current = false;
        setSaveHint(
          nextPublished
            ? 'Опубликовано'
            : `Черновик сохранён · ${new Date().toLocaleTimeString()}`,
        );
        if (mode === 'publish') message.success('Задание опубликовано');
        else if (mode === 'draft') message.success('Черновик сохранён');
        qc.invalidateQueries({ queryKey: ['assignments', courseId] });
        return true;
      }

      const payload: Record<string, unknown> = {
        scope,
        title,
        maxXp,
        maxAttempts,
        isPublished: nextPublished,
        responseMode,
        questions: buildQuestionsPayload(),
      };
      if (scope === 'LESSON') payload.lessonId = lessonId;
      if (scope === 'MODULE') payload.moduleId = moduleId;

      const created = await api<{ id: string }>(
        `/courses/${courseId}/assignments`,
        {
          method: 'POST',
          json: payload,
        },
      );
      setMaterialsFor(created.id);
      setEditingId(created.id);
      setPublished(nextPublished);
      dirtyRef.current = false;
      setSaveHint(
        nextPublished
          ? 'Опубликовано'
          : `Черновик создан · ${new Date().toLocaleTimeString()}`,
      );
      if (mode === 'publish') {
        message.success(
          `Опубликовано ДЗ «${title}» с ${
            responseMode === 'FILE' ? 0 : questions.length
          } вопр.`,
        );
      } else if (mode === 'draft') {
        message.success('Черновик создан (ученики его не видят)');
      }
      qc.invalidateQueries({ queryKey: ['assignments', courseId] });
      return true;
    } catch (e) {
      if (mode !== 'autosave') {
        message.error(e instanceof Error ? e.message : 'Ошибка сохранения');
      } else {
        setSaveHint('Не удалось автосохранить');
      }
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Autosave unfinished work as an unpublished draft (or update existing).
  useEffect(() => {
    if (skipAutosaveRef.current) return;
    if (!canPersist()) return;
    const t = window.setTimeout(() => {
      if (skipAutosaveRef.current || savingRef.current) return;
      void persist('autosave');
    }, 1800);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    title,
    maxXp,
    maxAttempts,
    published,
    responseMode,
    scope,
    lessonId,
    moduleId,
    questions,
  ]);

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: '220px 1fr minmax(280px, 320px)' }}
    >
      <Card size="small" title="Вопросы этого ДЗ">
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8 }}>
          Все вопросы ниже войдут в <strong>одно</strong> домашнее задание.
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Button block onClick={() => addQuestion('CHOICE')}>
            + Тест (варианты)
          </Button>
          <Button block onClick={() => addQuestion('SHORT')}>
            + Короткий ответ
          </Button>
          <Button block onClick={() => addQuestion('OPEN')}>
            + Развёрнутый ответ
          </Button>
          <Divider style={{ margin: '8px 0' }} />
          <List
            size="small"
            dataSource={questions}
            renderItem={(q, idx) => (
              <List.Item
                onClick={() => setActive(q.key)}
                style={{
                  cursor: 'pointer',
                  background: q.key === active ? 'var(--accent-soft)' : undefined,
                  padding: 8,
                  borderRadius: 8,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                    Вопрос {idx + 1} · {q.type}
                  </div>
                  <Typography.Text type="secondary" ellipsis>
                    {q.prompt}
                  </Typography.Text>
                </div>
              </List.Item>
            )}
          />
        </Space>
      </Card>

      <Card
        size="small"
        title={editingId ? 'Редактирование ДЗ' : 'Новое ДЗ'}
        extra={
          editingId ? (
            <Button type="link" size="small" onClick={resetDraft}>
              Новое
            </Button>
          ) : null
        }
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Form layout="vertical">
            <Form.Item
              label="Название задания"
              extra="Это название одного ДЗ целиком (не отдельного вопроса)."
            >
              <Input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  markDirty();
                }}
              />
            </Form.Item>
            <Form.Item label="Уровень задания">
              <Select
                value={scope}
                onChange={(v) => {
                  setScope(v);
                  markDirty();
                }}
                disabled={!!editingId}
                options={[
                  { value: 'LESSON', label: 'К уроку' },
                  { value: 'MODULE', label: 'К модулю (промежуточный)' },
                  { value: 'COURSE', label: 'К курсу' },
                ]}
              />
            </Form.Item>
            {scope === 'LESSON' && (
              <Form.Item label="Урок" required>
                <Select
                  value={lessonId}
                  onChange={(v) => {
                    setLessonId(v);
                    markDirty();
                  }}
                  disabled={!!editingId}
                  options={lessons.map((l) => ({
                    value: l.id,
                    label: `${l.title}`,
                  }))}
                  placeholder="Выберите урок"
                />
              </Form.Item>
            )}
            {scope === 'MODULE' && (
              <Form.Item label="Модуль" required>
                <Select
                  value={moduleId}
                  onChange={(v) => {
                    setModuleId(v);
                    markDirty();
                  }}
                  disabled={!!editingId}
                  options={modules.map((m) => ({ value: m.id, label: m.title }))}
                />
              </Form.Item>
            )}
            <Form.Item label="Режим ответа">
              <Select
                value={responseMode}
                onChange={(v) => {
                  setResponseMode(v);
                  markDirty();
                }}
                options={[
                  { value: 'QUIZ', label: 'Тест' },
                  { value: 'FILE', label: 'Развёрнутое (файл)' },
                  { value: 'QUIZ_AND_FILE', label: 'Смешанное (тест + файл)' },
                ]}
              />
            </Form.Item>
            <Space>
              <Form.Item label="Max XP">
                <InputNumber
                  min={0}
                  value={maxXp}
                  onChange={(v) => {
                    setMaxXp(v ?? 0);
                    markDirty();
                  }}
                />
              </Form.Item>
              <Form.Item label="Попытки (пусто = ∞)">
                <InputNumber
                  min={1}
                  value={maxAttempts ?? undefined}
                  onChange={(v) => {
                    setMaxAttempts(v);
                    markDirty();
                  }}
                />
              </Form.Item>
              <Form.Item
                label="Опубликовано"
                extra="Выкл = черновик (ученики не видят)"
              >
                <Switch
                  checked={published}
                  onChange={(v) => {
                    setPublished(v);
                    markDirty();
                  }}
                />
              </Form.Item>
            </Space>
          </Form>

          {responseMode === 'FILE' ? (
            <Typography.Paragraph type="secondary">
              Вопросы не нужны — ученик сдаёт PNG/PDF. После создания добавьте бланки в
              «Материалы задания» справа.
            </Typography.Paragraph>
          ) : current ? (
            <Card type="inner" title={`Вопрос · ${current.type}`}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Input.TextArea
                  rows={3}
                  value={current.prompt}
                  onChange={(e) =>
                    setQuestions((qs) =>
                      qs.map((q) =>
                        q.key === current.key ? { ...q, prompt: e.target.value } : q,
                      ),
                    )
                  }
                />
                <InputNumber
                  addonBefore="Баллы"
                  min={0}
                  value={current.points}
                  onChange={(v) =>
                    setQuestions((qs) =>
                      qs.map((q) =>
                        q.key === current.key ? { ...q, points: v ?? 0 } : q,
                      ),
                    )
                  }
                />

                {current.type === 'CHOICE' && (
                  <div>
                    <Typography.Text strong>Варианты (отметьте верные)</Typography.Text>
                    {(current.options ?? []).map((opt, idx) => (
                      <Space key={opt.id} style={{ display: 'flex', marginTop: 8 }}>
                        <Checkbox
                          checked={current.correctKeys?.includes(opt.id)}
                          onChange={(e) => {
                            const keys = new Set(current.correctKeys ?? []);
                            if (e.target.checked) keys.add(opt.id);
                            else keys.delete(opt.id);
                            setQuestions((qs) =>
                              qs.map((q) =>
                                q.key === current.key
                                  ? { ...q, correctKeys: [...keys] }
                                  : q,
                              ),
                            );
                          }}
                        />
                        <Input
                          value={opt.text}
                          onChange={(e) => {
                            const options = [...(current.options ?? [])];
                            options[idx] = { ...opt, text: e.target.value };
                            setQuestions((qs) =>
                              qs.map((q) =>
                                q.key === current.key ? { ...q, options } : q,
                              ),
                            );
                          }}
                        />
                      </Space>
                    ))}
                    <Button
                      style={{ marginTop: 8 }}
                      onClick={() => {
                        const id = String.fromCharCode(97 + (current.options?.length ?? 0));
                        const options = [
                          ...(current.options ?? []),
                          { id, text: `Вариант ${id.toUpperCase()}` },
                        ];
                        setQuestions((qs) =>
                          qs.map((q) =>
                            q.key === current.key ? { ...q, options } : q,
                          ),
                        );
                      }}
                    >
                      + Вариант
                    </Button>
                  </div>
                )}

                {current.type === 'SHORT' && (
                  <div>
                    <Radio.Group
                      value={current.shortMatch ?? 'EXACT'}
                      onChange={(e) =>
                        setQuestions((qs) =>
                          qs.map((q) =>
                            q.key === current.key
                              ? { ...q, shortMatch: e.target.value }
                              : q,
                          ),
                        )
                      }
                      options={[
                        { value: 'EXACT', label: 'Точная строка' },
                        { value: 'NUMBER', label: 'Число' },
                      ]}
                    />
                    <Input
                      style={{ marginTop: 8 }}
                      placeholder="Правильные ответы через запятую"
                      value={(current.correctKeys ?? []).join(', ')}
                      onChange={(e) =>
                        setQuestions((qs) =>
                          qs.map((q) =>
                            q.key === current.key
                              ? {
                                  ...q,
                                  correctKeys: e.target.value
                                    .split(',')
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                }
                              : q,
                          ),
                        )
                      }
                    />
                    {current.shortMatch === 'NUMBER' && (
                      <InputNumber
                        style={{ marginTop: 8 }}
                        addonBefore="Допуск"
                        value={current.numberTolerance ?? 0}
                        onChange={(v) =>
                          setQuestions((qs) =>
                            qs.map((q) =>
                              q.key === current.key
                                ? { ...q, numberTolerance: v ?? 0 }
                                : q,
                            ),
                          )
                        }
                      />
                    )}
                  </div>
                )}

                {current.type === 'OPEN' && (
                  <Typography.Paragraph type="secondary">
                    Ответ ученика уйдёт на проверку куратору. Баллы выставите в очереди
                    «Проверка».
                  </Typography.Paragraph>
                )}

                <Button
                  danger
                  onClick={() => {
                    setQuestions((qs) => qs.filter((q) => q.key !== current.key));
                    setActive(questions.find((q) => q.key !== current.key)?.key ?? '');
                  }}
                >
                  Удалить вопрос
                </Button>
              </Space>
            </Card>
          ) : null}

          {saveHint ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {saveHint}
              {saving ? '…' : ''}
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Выберите урок и правьте вопросы — черновик сохранится сам (~2 с).
              Ученики видят только опубликованные ДЗ.
            </Typography.Text>
          )}
          <Space wrap>
            <Button loading={saving} onClick={() => void persist('draft')}>
              Сохранить черновик
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => void persist('publish')}
            >
              Опубликовать
            </Button>
          </Space>
        </Space>
      </Card>

      <Card size="small" title="Список ДЗ курса">
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          Каждая карточка — одно задание. Вопросы внутри него не отдельные ДЗ.
        </Typography.Paragraph>
        <p style={{ margin: '0 0 4px' }}>
          Сейчас в редакторе: {responseModeSelectLabel(responseMode)}
        </p>
        <p style={{ margin: '0 0 4px' }}>
          Вопросов в черновике: {responseMode === 'FILE' ? 0 : questions.length}
        </p>
        <p style={{ margin: '0 0 4px' }}>
          Сумма баллов: {responseMode === 'FILE' ? 0 : totalPoints}
        </p>
        <p style={{ margin: '0 0 8px' }}>Max XP: {maxXp}</p>
        <Divider />
        <Typography.Text strong>Созданные задания</Typography.Text>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginTop: 10,
          }}
        >
          {(list.data ?? []).map((a) => {
            const qCount = a.questions?.length ?? 0;
            return (
              <div
                key={a.id}
                style={{
                  border:
                    editingId === a.id
                      ? '1px solid #beaaf2'
                      : '1px solid #f0f0f0',
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: editingId === a.id ? '#f7f5ff' : '#fafafa',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.35 }}>
                  {a.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#8c8c8c',
                    marginTop: 2,
                    marginBottom: 6,
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>
                    {assignmentTypeLabel(a.responseMode, a.questions)}
                    {` · ${qCount} ${qCount === 1 ? 'вопрос' : 'вопр.'}`}
                  </span>
                  {a.isPublished ? (
                    <Tag color="success" style={{ margin: 0 }}>
                      опубликовано
                    </Tag>
                  ) : (
                    <Tag style={{ margin: 0 }}>черновик</Tag>
                  )}
                </div>
                {qCount > 0 ? (
                  <ol
                    style={{
                      margin: '0 0 8px',
                      paddingLeft: 18,
                      fontSize: 12,
                      color: '#595959',
                    }}
                  >
                    {(a.questions ?? []).slice(0, 8).map((q, i) => (
                      <li key={`${a.id}-q-${i}`}>
                        {q.type}
                        {q.prompt ? `: ${q.prompt.slice(0, 48)}` : ''}
                      </li>
                    ))}
                    {qCount > 8 ? <li>…ещё {qCount - 8}</li> : null}
                  </ol>
                ) : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingInline: 0 }}
                    onClick={() => void loadAssignment(a.id)}
                  >
                    Открыть
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    style={{ paddingInline: 0 }}
                    onClick={() =>
                      setMaterialsFor((prev) => (prev === a.id ? null : a.id))
                    }
                  >
                    {materialsFor === a.id ? 'Скрыть материалы' : 'Материалы'}
                  </Button>
                  <Button
                    type="link"
                    size="small"
                    danger
                    style={{ paddingInline: 0 }}
                    onClick={() => {
                      Modal.confirm({
                        title: 'Удалить задание?',
                        content: `«${a.title}» и все сдачи будут удалены.`,
                        okText: 'Удалить',
                        okType: 'danger',
                        cancelText: 'Отмена',
                        onOk: async () => {
                          try {
                            await api(`/assignments/${a.id}`, {
                              method: 'DELETE',
                            });
                            message.success('Задание удалено');
                            if (materialsFor === a.id) setMaterialsFor(null);
                            if (editingId === a.id) resetDraft();
                            qc.invalidateQueries({
                              queryKey: ['assignments', courseId],
                            });
                          } catch (e) {
                            message.error(
                              e instanceof Error ? e.message : 'Ошибка',
                            );
                          }
                        },
                      });
                    }}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            );
          })}
          {!list.data?.length ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Пока нет заданий — добавьте вопросы слева и нажмите «Создать одно ДЗ»
            </Typography.Text>
          ) : null}
        </div>
        {materialsFor ? (
          <div style={{ marginTop: 12 }}>
            <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
              Материалы ДЗ
            </Typography.Text>
            <div style={{ marginTop: 8 }}>
              <FileUploadButton
                ownerType="ASSIGNMENT_MATERIAL"
                ownerId={materialsFor}
              />
            </div>
            <FileList ownerType="ASSIGNMENT_MATERIAL" ownerId={materialsFor} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
