import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST') || 'localhost';
    const port = this.configService.get<number>('SMTP_PORT') || 587;
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const from = this.configService.get<string>('SMTP_FROM') || 'LogiFlow <noreply@logiflow.com>';
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
    const subject = `Neue Zuweisung Schichtplan - ${planDetails.date}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #6200EE;">Schichtplan Zuweisung</h2>
        <p>Hallo ${planDetails.employeeName},</p>
        <p>Sie wurden für einen neuen Schichtplan im LogiFlow-System eingeteilt:</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Datum:</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${planDetails.date}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Lager:</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${planDetails.warehouseName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold;">Halle:</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${planDetails.hallName}</td>
          </tr>
          ${planDetails.containers && planDetails.containers.length > 0 ? `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; font-weight: bold; vertical-align: top;">Container:</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">
              ${planDetails.containers.join(', ')}
            </td>
          </tr>
          ` : ''}
        </table>
        <p style="margin-top: 20px;">Bitte loggen Sie sich in das Dashboard ein, um weitere Details zu sehen.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;" />
        <p style="font-size: 12px; color: #888; text-align: center;">Dies ist eine automatisierte Nachricht von LogiFlow Warehouse Management.</p>
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
