import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: false,
  });
  app.setGlobalPrefix("v1");
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(Number(process.env.PORT ?? 3001), "0.0.0.0");
}

void bootstrap();
