import 'dotenv/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '400kb' });
  // Render's proxy adds the caller's address to X-Forwarded-For; trust that one
  // hop (not the whole header, which callers can fake) so rate limits see real IPs.
  app.set('trust proxy', 1);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
