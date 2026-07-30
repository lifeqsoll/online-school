import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Schedule (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let studentToken: string;
  let courseId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const admin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: process.env.ADMIN_EMAIL,
        password: process.env.ADMIN_PASSWORD,
      })
      .expect(200);
    adminToken = admin.body.accessToken;

    const email = `sched_${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Secret123!', firstName: 'Sched' })
      .expect(201);
    studentToken = reg.body.accessToken;

    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Sched Course ${Date.now()}`,
        priceCents: 0,
        isPublished: true,
      })
      .expect(201);
    courseId = course.body.id;

    await request(app.getHttpServer())
      .post(`/courses/${courseId}/enroll`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('curator/admin creates LIVE event; student sees it on /me/calendar', async () => {
    const created = await request(app.getHttpServer())
      .post(`/courses/${courseId}/events`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Лекция 1',
        type: 'LIVE',
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 90000000).toISOString(),
        meetingUrl: 'https://meet.example.com/x',
      })
      .expect(201);

    const from = new Date(Date.now() - 86400000).toISOString();
    const to = new Date(Date.now() + 7 * 86400000).toISOString();
    const cal = await request(app.getHttpServer())
      .get(
        `/me/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(cal.body.some((e: { id: string }) => e.id === created.body.id)).toBe(
      true,
    );
  });

  it('student cannot create events', async () => {
    await request(app.getHttpServer())
      .post(`/courses/${courseId}/events`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Nope',
        type: 'DEADLINE',
        startsAt: new Date().toISOString(),
      })
      .expect(403);
  });
});
