import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { join } from "node:path";
import { AppModule } from "./app.module";
import type { AppConfig } from "./config/configuration";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService<AppConfig, true>);

  // Sin esto, el navegador bloquea las imagenes subidas (vale, evidencias)
  // cuando se cargan desde un origen distinto al del API (web en :3000,
  // API en :3001, o dominios distintos en produccion) — Access-Control-*
  // no alcanza para <img>, hace falta relajar tambien esta politica.
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cookieParser());
  app.enableCors({
    origin: configService.get("corsOrigin", { infer: true }),
    credentials: true,
  });

  const apiPrefix = configService.get("apiPrefix", { infer: true });
  app.setGlobalPrefix(apiPrefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const storageConfig = configService.get("storage", { infer: true });
  app.useStaticAssets(join(process.cwd(), storageConfig.localPath), { prefix: "/uploads" });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("VALTIC API")
    .setDescription("API de digitalizacion de vales de despacho para flotas de volquetas")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, document);

  const port = configService.get("apiPort", { infer: true });
  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(`VALTIC API escuchando en http://localhost:${port}/${apiPrefix}`);
  logger.log(`Documentacion Swagger en http://localhost:${port}/docs`);
}

bootstrap();
