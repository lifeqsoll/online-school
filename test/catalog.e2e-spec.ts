import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Catalog (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let studentToken: string;
  let studentId: string;
  let courseId: string;
  let moduleId: string;
  let lessonId: string;

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

    const email = `cat_${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Secret123!', firstName: 'Cat' })
      .expect(201);
    studentToken = reg.body.accessToken;
    studentId = reg.body.user.id;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('admin creates free course with module and lesson', async () => {
    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Free Course ${Date.now()}`,
        priceCents: 0,
        isPublished: true,
      })
      .expect(201);
    courseId = course.body.id;

    const mod = await request(app.getHttpServer())
      .post(`/courses/${courseId}/modules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'M1' })
      .expect(201);
    moduleId = mod.body.id;

    const lesson = await request(app.getHttpServer())
      .post(`/modules/${moduleId}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'L1', type: 'VIDEO', isPublished: true })
      .expect(201);
    lessonId = lesson.body.id;

    await request(app.getHttpServer())
      .patch(`/lessons/${lessonId}/video/external`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })
      .expect(200);
  });

  it('guest can list published courses without auth', async () => {
    const res = await request(app.getHttpServer()).get('/courses').expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const c of res.body) {
      expect(c.isPublished).toBe(true);
    }
  });

  it('guest can get published course detail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/courses/${courseId}`)
      .expect(200);
    expect(res.body.id).toBe(courseId);
    const lesson = res.body.modules?.[0]?.lessons?.[0];
    expect(lesson?.title).toBe('L1');
    expect(lesson?.videoUrl).toBeUndefined();
    expect(lesson?.content).toBeUndefined();
  });

  it('student free-enrolls and gets playback', async () => {
    await request(app.getHttpServer())
      .post(`/courses/${courseId}/enroll`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    const playback = await request(app.getHttpServer())
      .get(`/lessons/${lessonId}/playback`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(playback.body.kind).toBe('youtube');
  });

  it('paid checkout + mock confirm', async () => {
    const paid = await request(app.getHttpServer())
      .post('/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Paid ${Date.now()}`,
        priceCents: 150000,
        isPublished: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/courses/${paid.body.id}/enroll`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(400);

    const checkout = await request(app.getHttpServer())
      .post(`/courses/${paid.body.id}/checkout`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    expect(checkout.body.confirmationUrl).toBeDefined();

    await request(app.getHttpServer())
      .post('/payments/mock/confirm')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ paymentId: checkout.body.payment.id })
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/me/enrollments')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(mine.body.some((e: { courseId: string }) => e.courseId === paid.body.id)).toBe(
      true,
    );
  });

  it('admin can grant enroll', async () => {
    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: `Grant ${Date.now()}`, priceCents: 0, isPublished: true })
      .expect(201);

    const otherEmail = `grant_${Date.now()}@test.local`;
    const other = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: otherEmail, password: 'Secret123!' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/courses/${course.body.id}/grants`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: other.body.user.id })
      .expect(201);
  });

  it('yookassa webhook stub returns 501', async () => {
    await request(app.getHttpServer())
      .post('/payments/webhooks/yookassa')
      .send({})
      .expect(501);
  });

  it('admin impersonates enrolled student', async () => {
    const imp = await request(app.getHttpServer())
      .post('/auth/impersonate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: studentId })
      .expect(201);
    expect(imp.body.accessToken).toBeDefined();
  });
});
