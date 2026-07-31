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
} from 'antd';
import { useMemo, useState } from 'react';
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
          questions?: Array<{ type: string }>;
        }>
      >(`/courses/${courseId}/assignments`),
  });

  const [scope, setScope] = useState<'LESSON' | 'MODULE' | 'COURSE'>('LESSON');
  const [lessonId, setLessonId] = useState<string>();
  const [moduleId, setModuleId] = useState<string>();
  const [title, setTitle] = useState('Новое задание');
  const [maxXp, setMaxXp] = useState(100);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
  const [published, setPublished] = useState(true);
  const [responseMode, setResponseMode] = useState<
    'QUIZ' | 'FILE' | 'QUIZ_AND_FILE'
  >('QUIZ');
  const [materialsFor, setMaterialsFor] = useState<string | null>(null);
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
  };

  const save = async () => {
    try {
      if (responseMode !== 'FILE' && questions.length === 0) {
        message.error('Добавьте хотя бы один вопрос');
        return;
      }
      const payload: Record<string, unknown> = {
        scope,
        title,
        maxXp,
        maxAttempts,
        isPublished: published,
        responseMode,
        questions:
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
              })),
      };
      if (scope === 'LESSON') payload.lessonId = lessonId;
      if (scope === 'MODULE') payload.moduleId = moduleId;

      const created = await api<{ id: string }>(`/courses/${courseId}/assignments`, {
        method: 'POST',
        json: payload,
      });
      message.success('Задание создано');
      setMaterialsFor(created.id);
      qc.invalidateQueries({ queryKey: ['assignments', courseId] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  };

  return (
    <div
      className="grid gap-4"
      style={{ gridTemplateColumns: '220px 1fr minmax(280px, 320px)' }}
    >
      <Card size="small" title="Вопросы">
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
            renderItem={(q) => (
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
                  <div>{q.type}</div>
                  <Typography.Text type="secondary" ellipsis>
                    {q.prompt}
                  </Typography.Text>
                </div>
              </List.Item>
            )}
          />
        </Space>
      </Card>

      <Card size="small" title="Редактор">
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Form layout="vertical">
            <Form.Item label="Уровень задания">
              <Select
                value={scope}
                onChange={(v) => setScope(v)}
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
                  onChange={setLessonId}
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
                  onChange={setModuleId}
                  options={modules.map((m) => ({ value: m.id, label: m.title }))}
                />
              </Form.Item>
            )}
            <Form.Item label="Название задания">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Form.Item>
            <Form.Item label="Режим ответа">
              <Select
                value={responseMode}
                onChange={setResponseMode}
                options={[
                  { value: 'QUIZ', label: 'Тест' },
                  { value: 'FILE', label: 'Развёрнутое (файл)' },
                  { value: 'QUIZ_AND_FILE', label: 'Смешанное (тест + файл)' },
                ]}
              />
            </Form.Item>
            <Space>
              <Form.Item label="Max XP">
                <InputNumber min={0} value={maxXp} onChange={(v) => setMaxXp(v ?? 0)} />
              </Form.Item>
              <Form.Item label="Попытки (пусто = ∞)">
                <InputNumber
                  min={1}
                  value={maxAttempts ?? undefined}
                  onChange={(v) => setMaxAttempts(v)}
                />
              </Form.Item>
              <Form.Item label="Опубликовано">
                <Switch checked={published} onChange={setPublished} />
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

          <Button type="primary" onClick={save}>
            Создать задание
          </Button>
        </Space>
      </Card>

      <Card size="small" title="Сводка">
        <p>Режим: {responseModeSelectLabel(responseMode)}</p>
        <p>Вопросов: {responseMode === 'FILE' ? 0 : questions.length}</p>
        <p>Сумма баллов: {responseMode === 'FILE' ? 0 : totalPoints}</p>
        <p>Max XP: {maxXp}</p>
        <Divider />
        <Typography.Text strong>Уже созданные</Typography.Text>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginTop: 10,
          }}
        >
          {(list.data ?? []).map((a) => (
            <div
              key={a.id}
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 10,
                padding: '10px 12px',
                background: '#fafafa',
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
                }}
              >
                {assignmentTypeLabel(a.responseMode, a.questions)}
                {a.isPublished ? ' · опубликовано' : ' · черновик'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
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
          ))}
          {!list.data?.length ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Пока нет заданий
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
