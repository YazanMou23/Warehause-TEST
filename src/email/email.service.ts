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

  async sendPasswordResetEmail(email: string, name: string, resetUrl: string): Promise<boolean> {
    const subject = 'LogiFlow — Passwort zurücksetzen / Password Reset';
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: auto; background-color: #0d1117; color: #e2e8f0; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b;">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0058be 0%, #003a8c 100%); padding: 32px 36px; text-align: center;">
          <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 10px; padding: 12px 16px; margin-bottom: 16px;">
            <span style="font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px;">LogiFlow</span>
          </div>
          <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff;">Passwort zurücksetzen</h1>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: rgba(255,255,255,0.7);">Password Reset Request</p>
        </div>

        <!-- Body -->
        <div style="padding: 32px 36px;">
          <p style="font-size: 15px; margin: 0 0 12px 0;">Hallo <strong style="color: #93c5fd;">${name}</strong>,</p>
          <p style="font-size: 14px; color: #94a3b8; line-height: 1.6; margin: 0 0 24px 0;">
            Wir haben eine Anfrage zum Zurücksetzen Ihres Passworts für Ihr LogiFlow-Konto erhalten.<br/>
            Klicken Sie auf die Schaltfläche unten, um ein neues Passwort festzulegen.
          </p>
          <p style="font-size: 13px; color: #64748b; margin: 0 0 24px 0; font-style: italic;">
            We received a request to reset the password for your LogiFlow account. Click the button below to set a new password.
          </p>
          
          <!-- CTA Button -->
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: #0058be; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 36px; border-radius: 8px; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(0,88,190,0.4);">
              Passwort zurücksetzen →
            </a>
          </div>

          <!-- Divider -->
          <div style="border-top: 1px solid #1e293b; margin: 28px 0;"></div>

          <!-- Info -->
          <div style="background: #111827; border: 1px solid #1e293b; border-radius: 8px; padding: 16px 20px;">
            <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.8px;">Sicherheitshinweis / Security Notice</p>
            <ul style="margin: 0; padding: 0 0 0 18px; font-size: 12px; color: #64748b; line-height: 1.8;">
              <li>Dieser Link ist <strong style="color: #94a3b8;">1 Stunde gültig</strong> / This link expires in <strong style="color: #94a3b8;">1 hour</strong></li>
              <li>Der Link kann nur einmal verwendet werden / Link can only be used once</li>
              <li>Falls Sie kein Reset angefragt haben, ignorieren Sie diese E-Mail</li>
              <li>If you didn't request this, please ignore this email</li>
            </ul>
          </div>

          <!-- Fallback link -->
          <p style="font-size: 11px; color: #475569; margin: 20px 0 0 0; word-break: break-all;">
            Falls der Button nicht funktioniert / If the button doesn't work:<br/>
            <a href="${resetUrl}" style="color: #0058be;">${resetUrl}</a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #060a0f; padding: 16px 36px; text-align: center; border-top: 1px solid #1e293b;">
          <p style="margin: 0; font-size: 11px; color: #334155;">LogiFlow Warehouse Management System — Automatisierte Systemnachricht</p>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #334155;">Bitte antworten Sie nicht auf diese E-Mail.</p>
        </div>
      </div>
    `;
    return this.sendEmail(email, subject, html);
  }
}
