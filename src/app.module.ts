import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validateEnv } from './config/env.validation';
import { CryptoModule } from './common/crypto/crypto.module';
import { HealthModule } from './health/health.module';
import { CoursesModule } from './courses/courses.module';
import { CourseModulesModule } from './course-modules/course-modules.module';
import { LessonsModule } from './lessons/lessons.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { PaymentsModule } from './payments/payments.module';
import { StorageModule } from './storage/storage.module';
import { Neo4jModule } from './neo4j/neo4j.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { MailModule } from './mail/mail.module';
import { RbacModule } from './rbac/rbac.module';
import { UsersModule } from './users/users.module';
import { ImpersonationModule } from './impersonation/impersonation.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { XpModule } from './xp/xp.module';
import { OutboxModule } from './outbox/outbox.module';
import { TopicsModule } from './topics/topics.module';
import { EngagementModule } from './engagement/engagement.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CourseEventsModule } from './course-events/course-events.module';
import { FilesModule } from './files/files.module';
import { SupportModule } from './support/support.module';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard } from './rbac/guards/jwt-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
      {
        name: 'auth',
        ttl: 60_000,
        limit: 20,
      },
    ]),
    CryptoModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    MailModule,
    AuditModule,
    RbacModule,
    AuthModule,
    UsersModule,
    EnrollmentsModule,
    PaymentsModule,
    CoursesModule,
    CourseModulesModule,
    LessonsModule,
    AssignmentsModule,
    SubmissionsModule,
    XpModule,
    OutboxModule,
    TopicsModule,
    EngagementModule,
    AnalyticsModule,
    CourseEventsModule,
    FilesModule,
    SupportModule,
    ImpersonationModule,
    HealthModule,
    Neo4jModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
