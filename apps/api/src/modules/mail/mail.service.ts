import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { AppConfig } from "../../config/configuration";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const mailConfig = this.configService.get("mail", { infer: true });
    this.fromAddress = mailConfig.fromAddress;

    // Sin SMTP configurado (dev sin credenciales todavia), el correo se
    // registra en el log del servidor en vez de fallar el flujo.
    this.transporter =
      mailConfig.smtpHost && mailConfig.smtpUser && mailConfig.smtpPass
        ? nodemailer.createTransport({
            host: mailConfig.smtpHost,
            port: mailConfig.smtpPort,
            secure: mailConfig.smtpPort === 465,
            auth: { user: mailConfig.smtpUser, pass: mailConfig.smtpPass },
            // Algunas redes resuelven el host SMTP via CNAME hacia un
            // servidor cuyo certificado no incluye el nombre original
            // (ej. Brevo -> sendinblue.com); fijar el SNI explicitamente
            // evita el error "Hostname/IP does not match certificate's altnames".
            tls: { servername: mailConfig.smtpHost },
          })
        : null;
  }

  async send(input: { to: string; subject: string; html: string; text: string }): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP no configurado — correo NO enviado. Para: ${input.to} | Asunto: ${input.subject}\n${input.text}`,
      );
      return;
    }

    await this.transporter.sendMail({
      from: this.fromAddress,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}
