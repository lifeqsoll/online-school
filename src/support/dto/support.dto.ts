import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SupportChannel, SupportTopic } from '@prisma/client';

export class CreateSupportThreadDto {
  @IsEnum(SupportChannel)
  channel!: SupportChannel;

  @IsEnum(SupportTopic)
  topic!: SupportTopic;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class PostSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class RateSupportThreadDto {
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export const COURSE_TOPICS: SupportTopic[] = [
  SupportTopic.LESSON_QUESTION,
  SupportTopic.HOMEWORK,
  SupportTopic.SCHEDULE_LIVE,
  SupportTopic.CONTENT_ACCESS,
  SupportTopic.PROGRESS_XP,
  SupportTopic.COURSE_CANCEL,
  SupportTopic.OTHER_COURSE,
];

export const TECH_TOPICS: SupportTopic[] = [
  SupportTopic.AUTH_ACCOUNT,
  SupportTopic.PAYMENT_ACCESS,
  SupportTopic.SITE_BUG,
  SupportTopic.MEDIA_FILES,
  SupportTopic.NOTIFICATIONS_EMAIL,
  SupportTopic.OTHER_TECH,
];

export const TOPIC_LABELS: Record<SupportTopic, string> = {
  LESSON_QUESTION: 'Вопрос по уроку / материалу',
  HOMEWORK: 'Домашнее задание / проверка',
  SCHEDULE_LIVE: 'Расписание / LIVE',
  CONTENT_ACCESS: 'Доступ к уроку / контенту',
  PROGRESS_XP: 'Прогресс / XP / рейтинг',
  COURSE_CANCEL: 'Отмена курса / возврат',
  OTHER_COURSE: 'Другое',
  AUTH_ACCOUNT: 'Вход / пароль / аккаунт',
  PAYMENT_ACCESS: 'Оплата / доступ после покупки',
  SITE_BUG: 'Ошибка сайта / баг',
  MEDIA_FILES: 'Видео / файлы не открываются',
  NOTIFICATIONS_EMAIL: 'Уведомления / почта',
  OTHER_TECH: 'Другое',
};
