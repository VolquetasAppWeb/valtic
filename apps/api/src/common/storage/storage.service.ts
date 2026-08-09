import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import type { AppConfig } from "../../config/configuration";

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export interface StoredFile {
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

// Abstraccion minima de almacenamiento: hoy escribe a disco local, pero el
// contrato (save/subfolder -> fileUrl) es el mismo que tendria un driver S3,
// para poder cambiar el backend sin tocar los modulos que la consumen.
@Injectable()
export class StorageService {
  private readonly baseDir: string;
  private readonly maxFileSizeBytes: number;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const storageConfig = this.configService.get("storage", { infer: true });
    this.baseDir = resolve(process.cwd(), storageConfig.localPath);
    this.maxFileSizeBytes = storageConfig.maxFileSizeMb * 1024 * 1024;
  }

  async save(file: Express.Multer.File, subfolder: string): Promise<StoredFile> {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException({
        code: "FILE_TYPE_NOT_ALLOWED",
        message: "Tipo de archivo no permitido. Usa JPG, PNG, WEBP o PDF.",
      });
    }
    if (file.size > this.maxFileSizeBytes) {
      throw new BadRequestException({
        code: "FILE_TOO_LARGE",
        message: `El archivo supera el tamano maximo permitido (${this.maxFileSizeBytes / (1024 * 1024)}MB).`,
      });
    }

    const targetDir = join(this.baseDir, subfolder);
    await mkdir(targetDir, { recursive: true });

    const fileName = `${randomUUID()}${extname(file.originalname)}`;
    await writeFile(join(targetDir, fileName), file.buffer);

    return {
      fileUrl: `/uploads/${subfolder}/${fileName}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    };
  }
}
