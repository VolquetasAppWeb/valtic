import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";
import type { ApiErrorResponse } from "@valtic/types";
import { randomUUID } from "node:crypto";

interface HttpExceptionBody {
  message?: string | string[];
  code?: string;
  details?: Record<string, unknown>;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = (request.headers["x-correlation-id"] as string) ?? randomUUID();

    const statusCode =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? (exception.getResponse() as HttpExceptionBody | string) : undefined;

    const body: HttpExceptionBody =
      typeof exceptionResponse === "object" && exceptionResponse !== null ? exceptionResponse : {};

    const message = Array.isArray(body.message)
      ? body.message.join("; ")
      : (body.message ?? (typeof exceptionResponse === "string" ? exceptionResponse : "Error interno del servidor"));

    const errorResponse: ApiErrorResponse = {
      statusCode,
      code: body.code ?? this.defaultCodeFor(statusCode),
      message,
      details: body.details,
      correlationId,
      timestamp: new Date().toISOString(),
    };

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${correlationId}] ${request.method} ${request.url} -> ${statusCode}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(statusCode).json(errorResponse);
  }

  private defaultCodeFor(statusCode: number): string {
    switch (statusCode) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      default:
        return "INTERNAL_ERROR";
    }
  }
}
