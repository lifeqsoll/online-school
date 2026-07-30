import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  const corsRaw = config.get<string>('corsOrigin') ?? 'http://localhost:5173';
  const corsOrigins = corsRaw.split(',').map((s) => s.trim()).filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length <= 1 ? corsOrigins[0] : corsOrigins,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useStaticAssets(join(process.cwd(), 'public'), {
    index: ['index.html'],
  });

  // Redirect API root to the React app; keep legacy test console at /console/
  const expressApp = app.getHttpAdapter().getInstance();
  const webOrigin =
    (config.get<string>('corsOrigin') ?? 'http://localhost:5173')
      .split(',')[0]
      ?.trim() || 'http://localhost:5173';
  expressApp.get('/', (_req: unknown, res: { redirect: (c: number, u: string) => void }) => {
    res.redirect(302, webOrigin);
  });
  expressApp.get(
    '/console',
    (_req: unknown, res: { sendFile: (p: string) => void }) => {
      res.sendFile(join(process.cwd(), 'public', 'index.html'));
    },
  );

  const port = config.get<number>('port') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`App UI: ${webOrigin}`);
  // eslint-disable-next-line no-console
  console.log(`Test console: http://localhost:${port}/console`);
}

bootstrap();
