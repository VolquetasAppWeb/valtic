import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../src/app.module";

describe("HealthController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/health responde con el estado de los servicios", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health");

    expect([200, 503]).toContain(response.status);
    expect(response.body).toHaveProperty("status");
    expect(response.body).toHaveProperty("services.database");
    expect(response.body).toHaveProperty("services.redis");
  });
});
