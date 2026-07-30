import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Homework (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let studentToken: string;
  let courseId: string;
  let lessonId: string;
  let moduleId: string;

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

    const email = `hw_${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Secret123!', firstName: 'Hw' })
      .expect(201);
    studentToken = reg.body.accessToken;

    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `HW Course ${Date.now()}`,
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

  it('auto-grades CHOICE+SHORT and updates XP + leaderboard', async () => {
    const asg = await request(app.getHttpServer())
      .post(`/courses/${courseId}/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        scope: 'LESSON',
        lessonId,
        title: 'Auto quiz',
        maxXp: 100,
        isPublished: true,
        questions: [
          {
            type: 'CHOICE',
            prompt: '2+2',
            points: 50,
            options: [
              { id: 'a', text: '4' },
              { id: 'b', text: '5' },
            ],
            correctKeys: ['a'],
          },
          {
            type: 'SHORT',
            prompt: 'num',
            points: 50,
            shortMatch: 'NUMBER',
            correctKeys: ['42'],
          },
        ],
      })
      .expect(201);

    expect(asg.body.questions[0].correctKeys).toBeDefined();

    const studentView = await request(app.getHttpServer())
      .get(`/assignments/${asg.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(studentView.body.questions[0].correctKeys).toBeUndefined();

    const sub = await request(app.getHttpServer())
      .post(`/assignments/${asg.body.id}/submissions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    const q1 = asg.body.questions[0].id;
    const q2 = asg.body.questions[1].id;
    await request(app.getHttpServer())
      .patch(`/submissions/${sub.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        answers: [
          { questionId: q1, value: ['a'] },
          { questionId: q2, value: '42' },
        ],
      })
      .expect(200);

    const done = await request(app.getHttpServer())
      .post(`/submissions/${sub.body.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    expect(done.body.status).toBe('AUTO_GRADED');
    expect(done.body.scoreXp).toBe(100);

    const xp = await request(app.getHttpServer())
      .get(`/courses/${courseId}/xp/me`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(xp.body.totalXp).toBe(100);

    const lb = await request(app.getHttpServer())
      .get(`/courses/${courseId}/leaderboard`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(lb.body[0].totalXp).toBeGreaterThanOrEqual(100);
  });

  it('OPEN goes to PENDING_REVIEW then grade awards XP', async () => {
    const asg = await request(app.getHttpServer())
      .post(`/courses/${courseId}/assignments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        scope: 'MODULE',
        moduleId,
        title: 'Essay',
        maxXp: 40,
        isPublished: true,
        questions: [
          { type: 'OPEN', prompt: 'Explain', points: 10 },
        ],
      })
      .expect(201);

    const sub = await request(app.getHttpServer())
      .post(`/assignments/${asg.body.id}/submissions`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/submissions/${sub.body.id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        answers: [
          { questionId: asg.body.questions[0].id, value: 'my essay' },
        ],
      })
      .expect(200);

    const pending = await request(app.getHttpServer())
      .post(`/submissions/${sub.body.id}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(201);
    expect(pending.body.status).toBe('PENDING_REVIEW');

    const graded = await request(app.getHttpServer())
      .post(`/submissions/${sub.body.id}/grade`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        answers: [
          {
            questionId: asg.body.questions[0].id,
            pointsAwarded: 10,
            feedback: 'ok',
          },
        ],
      })
      .expect(201);

    expect(graded.body.status).toBe('GRADED');
    expect(graded.body.scoreXp).toBe(40);
  });
});
