import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Analytics (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let studentToken: string;
  let courseId: string;
  let lessonId: string;
  let topicId: string;

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

    const email = `an_${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Secret123!', firstName: 'An' })
      .expect(201);
    studentToken = reg.body.accessToken;

    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Analytics ${Date.now()}`,
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

    const lesson = await request(app.getHttpServer())
      .post(`/modules/${mod.body.id}/lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'L1', type: 'TEXT', isPublished: true })
      .expect(201);
    lessonId = lesson.body.id;

    await request(app.getHttpServer())
      .post(`/courses/${courseId}/enroll`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('topics, engagement, struggling radar after low score', async () => {
    const topic = await request(app.getHttpServer())
      .post(`/courses/${courseId}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Алгебра' })
      .expect(201);
    topicId = topic.body.id;

    await request(app.getHttpServer())
      .put(`/lessons/${lessonId}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ topicIds: [topicId] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/lessons/${lessonId}/engagement`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ type: 'COMPLETE', progressPct: 95 })
      .expect(201);

    const asg = await request(app.getHttpServer())
      .post(`/courses/${courseId}/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        scope: 'LESSON',
        lessonId,
        title: 'Hard quiz',
        maxXp: 100,
        isPublished: true,
        questions: [
          {
            type: 'CHOICE',
            prompt: 'x',
            points: 100,
            options: [
              { id: 'a', text: 'ok' },
              { id: 'b', text: 'bad' },
            ],
            correctKeys: ['a'],
          },
        ],
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/assignments/${asg.body.id}/topics`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ topicIds: [topicId] })
      .expect(200);

    const sub = await request(app.getHttpServer())
      .post(`/assignments/${asg.body.id}/submissions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/submissions/${sub.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        answers: [{ questionId: asg.body.questions[0].id, value: ['b'] }],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/submissions/${sub.body.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    const radar = await request(app.getHttpServer())
      .get(`/courses/${courseId}/analytics/radar/me`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(radar.body.labels).toContain('Алгебра');
    expect(radar.body.values[0]).toBe(0);
    expect(radar.body.struggling[0]).toBe(true);

    const cold = await request(app.getHttpServer())
      .get(`/courses/${courseId}/analytics/cold-lessons`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(Array.isArray(cold.body)).toBe(true);

    const graph = await request(app.getHttpServer())
      .get(`/courses/${courseId}/analytics/graph`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(graph.body.source).toMatch(/postgres|neo4j/);
  });
});
