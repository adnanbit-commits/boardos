// src/main.ts
// NestJS bootstrap — validation, CORS, Swagger, port binding.

import { NestFactory }       from '@nestjs/core';
import { ValidationPipe }    from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule }         from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Validation ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist:        true,   // strip unknown properties
      forbidNonWhitelisted: false,
      transform:        true,   // auto-cast primitives (string → number etc.)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ── CORS ─────────────────────────────────────────────────────────────────
  app.enableCors({
    origin:      process.env.APP_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  // ── Swagger (dev only) ───────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('BoardOS API')
      .setDescription('Governance platform for Indian private companies')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`BoardOS API running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}

bootstrap();
