import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.hostinger.com';
    const port = Number(this.configService.get('SMTP_PORT')) || 465;
    const user = this.configService.get<string>('SMTP_USER') || 'info@yazan-tech.com';
    const pass = this.configService.get<string>('SMTP_PASS') || 'password';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465 || host.includes('hostinger'),
      auth: {
        user,
        pass,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const from = this.configService.get<string>('SMTP_FROM') || 'LogiFlow <info@yazan-tech.com>';
    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent successfully to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      return false;
    }
  }

  async sendPlanNotification(email: string, planDetails: any): Promise<boolean> {
    const subject = `Schichtplan Zuweisung: ${planDetails.title} - ${planDetails.date}`;
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
        <div style="text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px;">
          <h2 style="color: #1d4ed8; margin: 0; font-size: 22px;">Schichtplan Zuweisung</h2>
          <p style="color: #64748b; margin: 5px 0 0 0; font-size: 14px;">LogiFlow Warehouse Management</p>
        </div>
        
        <p>Hallo <strong>${planDetails.employeeName}</strong>,</p>
        <p>Sie wurden für eine neue Schicht eingeteilt:</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
          <h3 style="margin: 0 0 8px 0; color: #1e293b; font-size: 16px;">${planDetails.title}</h3>
          <p style="margin: 0; color: #475569; font-size: 14px; line-height: 1.5;">${planDetails.description}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 14px;">
          <tr>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b; width: 30%;">Datum:</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${planDetails.date}</td>
          </tr>
          <tr>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Lagerort:</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${planDetails.warehouseName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b;">Halle:</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${planDetails.hallName}</td>
          </tr>
          ${planDetails.containers && planDetails.containers.length > 0 ? `
          <tr>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #64748b; vertical-align: top;">Zugeordnete Container (Aufgaben):</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-size: 13px; color: #0f172a;">
              ${planDetails.containers.join(', ')}
            </td>
          </tr>
          ` : ''}
        </table>
        
        <p style="margin-top: 25px; text-align: center;">
          <a href="http://localhost:3001" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px -1px rgba(59, 131, 246, 0.2);">
            Zum Dashboard einloggen
          </a>
        </p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 30px;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">Dies ist eine automatisierte Systemnachricht von LogiFlow. Bitte antworten Sie nicht direkt auf diese E-Mail.</p>
      </div>
    `;
    return this.sendEmail(email, subject, html);
  }

  async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    const subject = 'Willkommen bei LogiFlow';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #6200EE;">Willkommen bei LogiFlow!</h2>
        <p>Hallo ${name},</p>
        <p>Ihr Account im LogiFlow Warehouse Management System wurde erfolgreich erstellt.</p>
        <p>Sie können sich nun unter Verwendung Ihrer Telefonnummer und Ihres Passworts einloggen.</p>
        <p style="margin-top: 20px;">Wir freuen uns auf die Zusammenarbeit!</p>
        <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;" />
        <p style="font-size: 12px; color: #888; text-align: center;">Dies ist eine automatisierte Nachricht von LogiFlow.</p>
      </div>
    `;
    return this.sendEmail(email, subject, html);
  }
}
