import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, InputNumber, Modal, Space, Table, Typography, message } from 'antd';
import { useState } from 'react';
import { api } from '../../shared/api/client';

type FileMeta = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

type Submission = {
  id: string;
  status: string;
  userId: string;
  displayName?: string;
  assignment: {
    id: string;
    title: string;
    responseMode?: string;
    maxXp?: number;
  };
  answers: Array<{
    id: string;
    questionId: string;
    value: unknown;
    pointsAwarded?: number | null;
    question?: { type: string; points: number; prompt: string };
  }>;
  files?: FileMeta[];
};

export function ReviewQueue({ courseId }: { courseId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['submissions', courseId, 'PENDING_REVIEW'],
    queryFn: () =>
      api<Submission[]>(
        `/courses/${courseId}/submissions?status=PENDING_REVIEW`,
      ),
  });

  const [current, setCurrent] = useState<Submission | null>(null);
  const [detail, setDetail] = useState<Submission | null>(null);

  const open = async (row: Submission) => {
    const asg = await api<{
      questions: Array<{ id: string; type: string; points: number; prompt: string }>;
      maxXp: number;
      responseMode: string;
    }>(`/assignments/${row.assignment.id}`);
    const merged: Submission = {
      ...row,
      assignment: {
        ...row.assignment,
        maxXp: asg.maxXp,
        responseMode: asg.responseMode,
      },
      answers: row.answers.map((a) => ({
        ...a,
        question: asg.questions.find((qq) => qq.id === a.questionId),
      })),
    };
    setDetail(merged);
    setCurrent(row);
  };

  const openFile = async (fileId: string) => {
    const res = await api<{ url: string }>(`/files/${fileId}/download`);
    window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  const studentLabel = (r: Submission) =>
    r.displayName?.trim() || r.userId;

  return (
    <div>
      <Typography.Paragraph type="secondary">
        Ответы и файлы, ожидающие оценки куратора
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={q.isLoading}
        dataSource={q.data ?? []}
        columns={[
          { title: 'Задание', render: (_, r) => r.assignment?.title },
          {
            title: 'Ученик',
            render: (_, r) => (
              <Typography.Text ellipsis style={{ maxWidth: 220, display: 'block' }}>
                {studentLabel(r)}
              </Typography.Text>
            ),
          },
          {
            title: 'Файлы',
            render: (_, r) => r.files?.length ?? 0,
          },
          { title: 'Статус', dataIndex: 'status' },
          {
            title: '',
            render: (_, r) => (
              <Button type="link" onClick={() => open(r)}>
                Проверить
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title={
          current
            ? `Проверка · ${studentLabel(current)}`
            : 'Проверка'
        }
        open={!!current}
        onCancel={() => {
          setCurrent(null);
          setDetail(null);
        }}
        footer={null}
        width={720}
        destroyOnClose
      >
        {detail && (
          <Form
            layout="vertical"
            onFinish={async (values) => {
              try {
                const openQs = (detail.answers ?? []).filter(
                  (a) => a.question?.type === 'OPEN',
                );
                await api(`/submissions/${detail.id}/grade`, {
                  method: 'POST',
                  json: {
                    answers: openQs.map((a) => ({
                      questionId: a.questionId,
                      pointsAwarded: Number(values[`p_${a.questionId}`] ?? 0),
                      feedback: values[`f_${a.questionId}`],
                    })),
                    ...(openQs.length === 0
                      ? { scoreXp: Number(values.scoreXp ?? 0) }
                      : {}),
                  },
                });
                message.success('Оценено');
                setCurrent(null);
                qc.invalidateQueries({
                  queryKey: ['submissions', courseId, 'PENDING_REVIEW'],
                });
              } catch (e) {
                message.error(e instanceof Error ? e.message : 'Ошибка');
              }
            }}
          >
            {(detail.files ?? []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Typography.Text strong>Файлы ученика</Typography.Text>
                <Space direction="vertical" style={{ display: 'flex', marginTop: 8 }}>
                  {detail.files!.map((f) => (
                    <Button key={f.id} type="link" onClick={() => openFile(f.id)}>
                      {f.originalName}
                    </Button>
                  ))}
                </Space>
              </div>
            )}

            {(detail.answers ?? [])
              .filter((a) => a.question?.type === 'OPEN')
              .map((a) => (
                <div key={a.questionId} style={{ marginBottom: 16, minWidth: 0 }}>
                  <Typography.Paragraph
                    strong
                    ellipsis={{ rows: 3, expandable: true, symbol: 'ещё' }}
                    style={{ marginBottom: 8, maxWidth: '100%' }}
                  >
                    {a.question?.prompt}
                  </Typography.Paragraph>
                  <Typography.Paragraph
                    style={{
                      background: 'var(--surface)',
                      padding: 12,
                      borderRadius: 8,
                      maxHeight: 280,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {String(a.value ?? '')}
                  </Typography.Paragraph>
                  <Form.Item
                    name={`p_${a.questionId}`}
                    label={`Баллы (макс ${a.question?.points ?? 0})`}
                    rules={[{ required: true }]}
                    initialValue={a.question?.points ?? 0}
                  >
                    <InputNumber min={0} max={a.question?.points ?? 100} />
                  </Form.Item>
                  <Form.Item name={`f_${a.questionId}`} label="Комментарий">
                    <Input.TextArea rows={2} />
                  </Form.Item>
                </div>
              ))}

            {(detail.answers ?? []).filter((a) => a.question?.type === 'OPEN')
              .length === 0 && (
              <Form.Item
                name="scoreXp"
                label={`XP (макс ${detail.assignment.maxXp ?? 0})`}
                rules={[{ required: true }]}
                initialValue={detail.assignment.maxXp ?? 0}
              >
                <InputNumber min={0} max={detail.assignment.maxXp ?? 1000} />
              </Form.Item>
            )}

            <Button type="primary" htmlType="submit" block>
              Сохранить оценку
            </Button>
          </Form>
        )}
      </Modal>
    </div>
  );
}
