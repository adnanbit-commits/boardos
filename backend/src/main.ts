// src/main.ts
import { NestFactory }       from '@nestjs/core';
import { ValidationPipe }    from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule }         from './app.module';
import * as session          from 'express-session';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Session — required for Passport OAuth state ──────────────────────────
  app.use(session({
    secret:            process.env.SESSION_SECRET ?? process.env.JWT_SECRET ?? 'boardos-session-secret',
    resave:            false,
    saveUninitialized: false,
    cookie:            { maxAge: 10 * 60 * 1000 }, // 10 min — just for OAuth handshake
  }));

  // ── Validation ───────────────────────────────────────────────────────────
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: false,
    transform: true, transformOptions: { enableImplicitConversion: true },
  }));

  // ── CORS ─────────────────────────────────────────────────────────────────
  app.enableCors({
    origin:      [
      process.env.FRONTEND_URL ?? 'http://localhost:3000',
      /\.nip\.io(:\d+)?$/,
    ],
    credentials: true,
  });

  // ── Swagger ──────────────────────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('SafeMinutes API').setDescription('Governance platform for Indian private companies')
    .setVersion('0.1.0').addBearerAuth().build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`SafeMinutes API running on http://localhost:${port}`);
  console.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
