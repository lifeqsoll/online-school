import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Rate,
  Space,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { useEffect, useState } from 'react';
import { api, ApiError, getAccessToken } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export type CourseReview = {
  id: string;
  rating: number;
  body?: string | null;
  createdAt: string;
  authorName: string;
  userId?: string;
  photos: Array<{
    id: string;
    originalName: string;
    mimeType: string;
    url: string;
    isPublished?: boolean;
  }>;
};

type MyReview = {
  id: string;
  rating: number;
  status: string;
  body?: string | null;
  publishedRating?: number | null;
  photos: CourseReview['photos'];
};

type Eligibility = {
  canWrite: boolean;
  canEdit: boolean;
  canDelete: boolean;
  enrolled: boolean;
  daysRequired: number;
  myReview?: MyReview | null;
};

const MAX_PHOTOS = 5;

export function CourseRatingBadge({
  avg,
  count,
  onClick,
  light,
}: {
  avg?: number;
  count?: number;
  onClick?: () => void;
  light?: boolean;
}) {
  const n = count ?? 0;
  const a = avg ?? 0;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        padding: 0,
        font: 'inherit',
        color: light ? 'rgba(255,255,255,0.92)' : '#6b4fb8',
      }}
    >
      <Rate
        disabled
        allowHalf
        value={a}
        style={{ fontSize: 14, color: light ? '#ffe58f' : undefined }}
      />
      <Typography.Text
        style={{
          fontSize: 13,
          color: light ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.45)',
        }}
      >
        {n > 0 ? `${a.toFixed(1)} · ${n}` : 'Нет отзывов'}
      </Typography.Text>
    </button>
  );
}

async function uploadReviewPhoto(reviewId: string, file: File) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('ownerType', 'COURSE_REVIEW');
  fd.append('ownerId', reviewId);
  await api('/files', { method: 'POST', body: fd });
}

export function CourseReviewsModal({
  courseId,
  courseTitle,
  open,
  onClose,
  writeMode = false,
}: {
  courseId: string;
  courseTitle?: string;
  open: boolean;
  onClose: () => void;
  writeMode?: boolean;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [writing, setWriting] = useState(writeMode);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [newFiles, setNewFiles] = useState<UploadFile[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<MyReview['photos']>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setWriting(writeMode);
      setEditingId(null);
      setRating(5);
      setBody('');
      setNewFiles([]);
      setExistingPhotos([]);
      setRemovedPhotoIds([]);
    }
  }, [open, writeMode]);

  const list = useQuery({
    queryKey: ['course-reviews', courseId],
    queryFn: () =>
      api<CourseReview[]>(`/courses/${courseId}/reviews`, {
        auth: getAccessToken() ? true : false,
      }),
    enabled: open && !!courseId,
  });

  const eligibility = useQuery({
    queryKey: ['course-reviews-elig', courseId],
    queryFn: () =>
      api<Eligibility>(`/courses/${courseId}/reviews/eligibility`),
    enabled: open && !!courseId && !!user,
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['course-reviews-elig', courseId] });
    await qc.invalidateQueries({ queryKey: ['course-reviews', courseId] });
    await qc.invalidateQueries({ queryKey: ['courses'] });
  };

  const startCreate = () => {
    setEditingId(null);
    setRating(5);
    setBody('');
    setNewFiles([]);
    setExistingPhotos([]);
    setRemovedPhotoIds([]);
    setWriting(true);
  };

  const startEdit = (mine: MyReview) => {
    setEditingId(mine.id);
    setRating(mine.rating);
    setBody(mine.body ?? '');
    setNewFiles([]);
    setExistingPhotos(mine.photos ?? []);
    setRemovedPhotoIds([]);
    setWriting(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      const pendingUploads = newFiles
        .map((f) => f.originFileObj as File | undefined)
        .filter(Boolean) as File[];
      const keepCount =
        existingPhotos.filter((p) => !removedPhotoIds.includes(p.id)).length +
        pendingUploads.length;
      if (keepCount > MAX_PHOTOS) {
        throw new Error(`Максимум ${MAX_PHOTOS} фото`);
      }

      let reviewId = editingId;
      if (editingId) {
        await api(`/reviews/${editingId}`, {
          method: 'PATCH',
          json: { rating, body: body.trim() || undefined },
        });
      } else {
        const created = await api<{ id: string }>(
          `/courses/${courseId}/reviews`,
          {
            method: 'POST',
            json: { rating, body: body.trim() || undefined },
          },
        );
        reviewId = created.id;
      }

      for (const id of removedPhotoIds) {
        await api(`/files/${id}`, { method: 'DELETE' });
      }
      for (const file of pendingUploads) {
        await uploadReviewPhoto(reviewId!, file);
      }
      return reviewId!;
    },
    onSuccess: async () => {
      message.success(
        editingId ? 'Отзыв обновлён' : 'Отзыв отправлен на проверку',
      );
      setWriting(false);
      setEditingId(null);
      setNewFiles([]);
      await invalidate();
    },
    onError: (e: Error) =>
      message.error(e instanceof ApiError ? e.message : e.message || 'Ошибка'),
  });

  const removeReview = useMutation({
    mutationFn: (id: string) => api(`/reviews/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      message.success('Отзыв удалён');
      setWriting(false);
      await invalidate();
    },
    onError: (e: Error) => message.error(e.message || 'Ошибка'),
  });

  const canWrite = !!eligibility.data?.canWrite;
  const canEdit = !!eligibility.data?.canEdit;
  const canDelete = !!eligibility.data?.canDelete;
  const mine = eligibility.data?.myReview;

  useEffect(() => {
    if (open && writeMode && canWrite && !writing && !mine) {
      setWriting(true);
    }
  }, [open, writeMode, canWrite, writing, mine]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={courseTitle ? `Отзывы · ${courseTitle}` : 'Отзывы о курсе'}
      footer={null}
      width={640}
      destroyOnClose
    >
      {user && canWrite && !writing ? (
        <Button
          type="primary"
          style={{ marginBottom: 16 }}
          onClick={startCreate}
        >
          Оставить отзыв
        </Button>
      ) : null}

      {user && eligibility.data && !canWrite && !mine ? (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Отзывы оставляют только участники курса.
        </Typography.Paragraph>
      ) : null}

      {mine && !writing ? (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 12,
            background: '#fafafa',
            border: '1px solid #f0f0f0',
          }}
        >
          <Typography.Text strong>Ваш отзыв</Typography.Text>
          <div style={{ margin: '6px 0' }}>
            <Rate disabled value={mine.rating} style={{ fontSize: 14 }} />
          </div>
          {mine.body ? (
            <Typography.Paragraph
              style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}
            >
              {mine.body}
            </Typography.Paragraph>
          ) : null}
          {mine.photos?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {mine.photos.map((p) => (
                <img
                  key={p.id}
                  src={p.url}
                  alt={p.originalName}
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: 'cover',
                    borderRadius: 8,
                  }}
                />
              ))}
            </div>
          ) : null}
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            {mine.status === 'PENDING'
              ? 'На проверке'
              : mine.status === 'APPROVED'
                ? 'Опубликован'
                : mine.status === 'REJECTED'
                  ? 'Отклонён — можно отправить заново'
                  : mine.status}
          </Typography.Text>
          <Space>
            {canEdit || canWrite ? (
              <Button size="small" onClick={() => startEdit(mine)}>
                {mine.status === 'REJECTED' ? 'Отправить заново' : 'Изменить'}
              </Button>
            ) : null}
            {canDelete ? (
              <Popconfirm
                title="Удалить отзыв?"
                okText="Удалить"
                cancelText="Отмена"
                okButtonProps={{ danger: true }}
                onConfirm={() => removeReview.mutate(mine.id)}
              >
                <Button size="small" danger loading={removeReview.isPending}>
                  Удалить
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        </div>
      ) : null}

      {writing && (canWrite || (editingId && canEdit)) ? (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 12,
            border: '1px solid #f0f0f0',
            background: '#fafafa',
          }}
        >
          <Typography.Text strong>Ваша оценка</Typography.Text>
          <div style={{ margin: '8px 0 12px' }}>
            <Rate value={rating} onChange={setRating} />
          </div>
          <Input.TextArea
            rows={4}
            maxLength={4000}
            showCount
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Что понравилось, что можно улучшить…"
          />
          <div style={{ marginTop: 12 }}>
            <Typography.Text
              type="secondary"
              style={{ display: 'block', marginBottom: 8 }}
            >
              Фото (PNG, JPEG, WebP), до {MAX_PHOTOS}
            </Typography.Text>
            {existingPhotos.filter((p) => !removedPhotoIds.includes(p.id))
              .length ? (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                {existingPhotos
                  .filter((p) => !removedPhotoIds.includes(p.id))
                  .map((p) => (
                    <div key={p.id} style={{ position: 'relative' }}>
                      <img
                        src={p.url}
                        alt={p.originalName}
                        style={{
                          width: 72,
                          height: 72,
                          objectFit: 'cover',
                          borderRadius: 8,
                        }}
                      />
                      <Button
                        size="small"
                        danger
                        type="text"
                        style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          background: '#fff',
                        }}
                        onClick={() =>
                          setRemovedPhotoIds((ids) => [...ids, p.id])
                        }
                      >
                        ×
                      </Button>
                    </div>
                  ))}
              </div>
            ) : null}
            <Upload
              accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
              listType="picture-card"
              fileList={newFiles}
              beforeUpload={() => false}
              onChange={({ fileList }) => {
                const capped = fileList.slice(
                  0,
                  Math.max(
                    0,
                    MAX_PHOTOS -
                      existingPhotos.filter(
                        (p) => !removedPhotoIds.includes(p.id),
                      ).length,
                  ),
                );
                setNewFiles(capped);
              }}
            >
              {existingPhotos.filter((p) => !removedPhotoIds.includes(p.id))
                .length +
                newFiles.length <
              MAX_PHOTOS
                ? '+ Фото'
                : null}
            </Upload>
          </div>
          <Space style={{ marginTop: 12 }}>
            <Button
              type="primary"
              loading={save.isPending}
              onClick={() => save.mutate()}
            >
              {editingId ? 'Сохранить' : 'Отправить'}
            </Button>
            <Button
              onClick={() => {
                setWriting(false);
                setEditingId(null);
              }}
            >
              Отмена
            </Button>
          </Space>
        </div>
      ) : null}

      {list.isLoading ? (
        <Typography.Text type="secondary">Загрузка…</Typography.Text>
      ) : (list.data?.filter((r) => r.userId !== user?.id).length ?? 0) ===
        0 ? (
        <Empty
          description={
            mine ? 'Других опубликованных отзывов пока нет' : 'Пока нет опубликованных отзывов'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {list.data!
            .filter((r) => r.userId !== user?.id)
            .map((r) => (
            <div
              key={r.id}
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 12,
                padding: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 6,
                }}
              >
                <Typography.Text strong>{r.authorName}</Typography.Text>
                <Rate disabled value={r.rating} style={{ fontSize: 14 }} />
              </div>
              {r.body ? (
                <Typography.Paragraph
                  style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}
                >
                  {r.body}
                </Typography.Paragraph>
              ) : null}
              {r.photos?.length ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {r.photos.map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                      <img
                        src={p.url}
                        alt={p.originalName}
                        style={{
                          width: 72,
                          height: 72,
                          objectFit: 'cover',
                          borderRadius: 8,
                        }}
                      />
                    </a>
                  ))}
                </div>
              ) : null}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {new Date(r.createdAt).toLocaleDateString('ru-RU')}
              </Typography.Text>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
