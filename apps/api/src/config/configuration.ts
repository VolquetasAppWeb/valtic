export interface AppConfig {
  nodeEnv: string;
  apiPort: number;
  apiPrefix: string;
  corsOrigin: string;
  databaseUrl: string;
  redisUrl: string;
  jwt: {
    accessSecret: string;
    accessExpiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  driverPin: {
    maxAttempts: number;
    lockMinutes: number;
  };
  adminLogin: {
    maxAttempts: number;
    lockMinutes: number;
  };
  qr: {
    signingSecret: string;
    expirationSeconds: number;
  };
  geofence: {
    maxAccuracyMeters: number;
    maxLocationAgeSeconds: number;
  };
  storage: {
    driver: string;
    localPath: string;
    maxFileSizeMb: number;
  };
  webAppUrl: string;
  passwordReset: {
    expirationMinutes: number;
  };
  mail: {
    smtpHost: string | undefined;
    smtpPort: number;
    smtpUser: string | undefined;
    smtpPass: string | undefined;
    fromAddress: string;
  };
}

export default (): AppConfig => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  // Railway (y la mayoria de PaaS) asignan el puerto via $PORT en runtime;
  // API_PORT queda como fallback para desarrollo local / docker-compose.
  apiPort: parseInt(process.env.PORT ?? process.env.API_PORT ?? "3001", 10),
  apiPrefix: process.env.API_PREFIX ?? "api/v1",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? "",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? "dev_access_secret",
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? "dev_refresh_secret",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "7d",
  },
  driverPin: {
    maxAttempts: parseInt(process.env.DRIVER_PIN_MAX_ATTEMPTS ?? "5", 10),
    lockMinutes: parseInt(process.env.DRIVER_PIN_LOCK_MINUTES ?? "15", 10),
  },
  adminLogin: {
    maxAttempts: parseInt(process.env.ADMIN_LOGIN_MAX_ATTEMPTS ?? "5", 10),
    lockMinutes: parseInt(process.env.ADMIN_LOGIN_LOCK_MINUTES ?? "15", 10),
  },
  qr: {
    signingSecret: process.env.QR_SIGNING_SECRET ?? "dev_qr_secret",
    expirationSeconds: parseInt(process.env.QR_EXPIRATION_SECONDS ?? "300", 10),
  },
  geofence: {
    maxAccuracyMeters: parseInt(process.env.GEOFENCE_MAX_ACCURACY_METERS ?? "50", 10),
    maxLocationAgeSeconds: parseInt(process.env.GEOFENCE_MAX_LOCATION_AGE_SECONDS ?? "60", 10),
  },
  storage: {
    driver: process.env.STORAGE_DRIVER ?? "local",
    localPath: process.env.STORAGE_LOCAL_PATH ?? "./uploads",
    maxFileSizeMb: parseInt(process.env.STORAGE_MAX_FILE_SIZE_MB ?? "10", 10),
  },
  webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:3000",
  passwordReset: {
    expirationMinutes: parseInt(process.env.PASSWORD_RESET_EXPIRATION_MINUTES ?? "30", 10),
  },
  mail: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: parseInt(process.env.SMTP_PORT ?? "587", 10),
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    fromAddress: process.env.MAIL_FROM ?? "VALTIC <no-reply@valtic.dev>",
  },
});
