import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Foundation auth (e2e)', () => {
  let app: INestApplication<App>;
  const password = 'Secret123!';
  let email: string;
  let studentId: string;
  let accessToken: string;
  let refreshToken: string;
  let adminAccess: string;

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

    email = `e2e_${Date.now()}@test.local`;
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /health', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('registers a student', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, firstName: 'E2E' })
      .expect(201);

    expect(res.body.user.globalRole).toBe('STUDENT');
    expect(res.body.accessToken).toBeDefined();
    studentId = res.body.user.id;
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('rejects bad login with Invalid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('logs in and refreshes tokens', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    accessToken = login.body.accessToken;
    refreshToken = login.body.refreshToken;

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(refreshed.body.accessToken).toBeDefined();
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);
    refreshToken = refreshed.body.refreshToken;
    accessToken = refreshed.body.accessToken;
  });

  it('returns profile from /users/me', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.email).toBe(email.toLowerCase());
  });

  it('admin can list users and impersonate student', async () => {
    const adminEmail = process.env.ADMIN_EMAIL!;
    const adminPassword = process.env.ADMIN_PASSWORD!;

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password: adminPassword })
      .expect(200);

    adminAccess = login.body.accessToken;

    const users = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminAccess}`)
      .expect(200);
    expect(Array.isArray(users.body)).toBe(true);

    const imp = await request(app.getHttpServer())
      .post('/auth/impersonate')
      .set('Authorization', `Bearer ${adminAccess}`)
      .send({ userId: studentId })
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${imp.body.accessToken}`)
      .expect(200);
    expect(me.body.id).toBe(studentId);

    const stop = await request(app.getHttpServer())
      .post('/auth/impersonate/stop')
      .set('Authorization', `Bearer ${imp.body.accessToken}`)
      .send({})
      .expect(201);

    const adminMe = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${stop.body.accessToken}`)
      .expect(200);
    expect(adminMe.body.globalRole).toBe('ADMIN');
  });

  it('forgot + reset password flow', async () => {
    const forgot = await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email })
      .expect(200);

    expect(forgot.body.resetToken).toBeDefined();
    const newPassword = 'NewSecret123!';

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: forgot.body.resetToken, newPassword })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
  });
});
