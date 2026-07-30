import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, InputNumber, Modal, Table, Typography, message } from 'antd';
import { useState } from 'react';
import { api } from '../../shared/api/client';

type Submission = {
  id: string;
  status: string;
  userId: string;
  assignment: { id: string; title: string };
  answers: Array<{
    id: string;
    questionId: string;
    value: unknown;
    pointsAwarded?: number | null;
    question?: { type: string; points: number; prompt: string };
  }>;
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
    // list may not include question meta — fetch assignment for OPEN ids
    const asg = await api<{
      questions: Array<{ id: string; type: string; points: number; prompt: string }>;
    }>(`/assignments/${row.assignment.id}`);
    const merged: Submission = {
      ...row,
      answers: row.answers.map((a) => ({
        ...a,
        question: asg.questions.find((qq) => qq.id === a.questionId),
      })),
    };
    setDetail(merged);
    setCurrent(row);
  };

  return (
    <div>
      <Typography.Paragraph type="secondary">
        Развёрнутые ответы, ожидающие оценки куратора
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={q.isLoading}
        dataSource={q.data ?? []}
        columns={[
          { title: 'Задание', render: (_, r) => r.assignment?.title },
          { title: 'Ученик', dataIndex: 'userId' },
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
        title="Проверка OPEN"
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
            {(detail.answers ?? [])
              .filter((a) => a.question?.type === 'OPEN')
              .map((a) => (
                <div key={a.questionId} style={{ marginBottom: 16 }}>
                  <Typography.Text strong>{a.question?.prompt}</Typography.Text>
                  <Typography.Paragraph
                    style={{
                      background: 'var(--surface)',
                      padding: 12,
                      borderRadius: 8,
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
            <Button type="primary" htmlType="submit" block>
              Сохранить оценку
            </Button>
          </Form>
        )}
      </Modal>
    </div>
  );
}
