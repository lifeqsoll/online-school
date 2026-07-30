import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/** Minimal 1x1 PNG */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Files (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  let studentToken: string;
  let outsiderToken: string;
  let courseId: string;
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

    const email = `files_${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'Secret123!', firstName: 'F' })
      .expect(201);
    studentToken = reg.body.accessToken;

    const out = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `out_${Date.now()}@test.local`,
        password: 'Secret123!',
        firstName: 'O',
      })
      .expect(201);
    outsiderToken = out.body.accessToken;

    const course = await request(app.getHttpServer())
      .post('/courses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: `Files Course ${Date.now()}`,
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

  it('staff uploads PNG material; enrolled student lists and downloads; outsider 403; jpeg rejected', async () => {
    const up = await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('ownerType', 'LESSON_MATERIAL')
      .field('ownerId', lessonId)
      .attach('file', PNG, { filename: 'dot.png', contentType: 'image/png' })
      .expect(201);

    expect(up.body.id).toBeDefined();
    expect(up.body.originalName).toBe('dot.png');

    await request(app.getHttpServer())
      .get('/files')
      .query({ ownerType: 'LESSON_MATERIAL', ownerId: lessonId })
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(403);

    const list = await request(app.getHttpServer())
      .get('/files')
      .query({ ownerType: 'LESSON_MATERIAL', ownerId: lessonId })
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(list.body).toHaveLength(1);

    const dl = await request(app.getHttpServer())
      .get(`/files/${up.body.id}/download`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);
    expect(dl.body.url).toMatch(/^https?:\/\//);

    await request(app.getHttpServer())
      .post('/files')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('ownerType', 'LESSON_MATERIAL')
      .field('ownerId', lessonId)
      .attach('file', Buffer.from([0xff, 0xd8, 0xff]), {
        filename: 'x.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);
  });
});
