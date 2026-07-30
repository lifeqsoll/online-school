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
} from 'antd';
import { useMemo, useState } from 'react';
import { api } from '../../shared/api/client';

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
    queryFn: () => api<Array<{ id: string; title: string; scope: string; isPublished: boolean }>>(
      `/courses/${courseId}/assignments`,
    ),
  });

  const [scope, setScope] = useState<'LESSON' | 'MODULE' | 'COURSE'>('LESSON');
  const [lessonId, setLessonId] = useState<string>();
  const [moduleId, setModuleId] = useState<string>();
  const [title, setTitle] = useState('Новое задание');
  const [maxXp, setMaxXp] = useState(100);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(3);
  const [published, setPublished] = useState(true);
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
      const payload: Record<string, unknown> = {
        scope,
        title,
        maxXp,
        maxAttempts,
        isPublished: published,
        questions: questions.map((q, i) => ({
          type: q.type,
          prompt: q.prompt,
          points: q.points,
          sortOrder: i,
          options: q.type === 'CHOICE' ? q.options : undefined,
          correctKeys:
            q.type === 'OPEN' ? undefined : q.correctKeys,
          shortMatch: q.type === 'SHORT' ? q.shortMatch : undefined,
          numberTolerance:
            q.type === 'SHORT' && q.shortMatch === 'NUMBER'
              ? q.numberTolerance ?? 0
              : undefined,
        })),
      };
      if (scope === 'LESSON') payload.lessonId = lessonId;
      if (scope === 'MODULE') payload.moduleId = moduleId;

      await api(`/courses/${courseId}/assignments`, {
        method: 'POST',
        json: payload,
      });
      message.success('Задание создано');
      qc.invalidateQueries({ queryKey: ['assignments', courseId] });
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    }
  };

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: '220px 1fr 240px' }}>
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

          {current && (
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
          )}

          <Button type="primary" onClick={save}>
            Создать задание
          </Button>
        </Space>
      </Card>

      <Card size="small" title="Сводка">
        <p>Вопросов: {questions.length}</p>
        <p>Сумма баллов: {totalPoints}</p>
        <p>Max XP: {maxXp}</p>
        <Divider />
        <Typography.Text strong>Уже созданные</Typography.Text>
        <List
          size="small"
          dataSource={list.data ?? []}
          renderItem={(a) => (
            <List.Item>
              {a.title} · {a.scope}{' '}
              {a.isPublished ? <Typography.Text type="success">pub</Typography.Text> : null}
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
}
