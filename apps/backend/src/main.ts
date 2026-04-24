import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/filters/api-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigin = process.env.CORS_ALLOWED_ORIGIN?.trim() || 'http://localhost:5000';

  app.enableCors({
    origin: allowedOrigin,
    credentials: true,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
