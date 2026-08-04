import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}


  /** Core send method — returns true on success, error message string on failure */
  async sendEmail(to: string, subject: string, html: string): Promise<string | true> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey || apiKey === 're_your_api_key_here') {
      const msg = 'Email service not configured: RESEND_API_KEY is missing in environment variables';
      this.logger.error(msg);
      return msg;
    }

    const fromAddress =
      this.configService.get<string>('EMAIL_FROM') ||
      'info@yazan-tech.com';
    const fromName = this.configService.get<string>('SMTP_FROM_NAME') || 'LogiFlow';
    const from = `${fromName} <${fromAddress}>`;

    try {
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({ from, to, subject, html });
      if (error) {
        this.logger.error(`✗ Resend API error to ${to} | ${JSON.stringify(error)}`);
        return (error as any).message ?? JSON.stringify(error);
      }
      this.logger.log(`✓ Email sent to ${to} [id: ${data?.id}]`);
      return true;
    } catch (err: any) {
      const msg = err?.message || 'Unknown email error';
      this.logger.error(`✗ Failed to send email to ${to} | ${msg}`, err?.stack);
      return msg;
    }
  }

  /** Convenience wrapper — returns boolean for backwards compat */
  private async sendEmailBool(to: string, subject: string, html: string): Promise<boolean> {
    return (await this.sendEmail(to, subject, html)) === true;
  }

  async sendPlanNotification(email: string, planDetails: any): Promise<string | true> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    
    const employeeName = planDetails.employeeName || planDetails.name || 'Mitarbeiter';
    const date = planDetails.date || 'Nicht angegeben';

    // Time computation
    let time = planDetails.time;
    if (!time) {
      if (planDetails.shift) {
        time = planDetails.shift;
      } else if (planDetails.startTime && planDetails.endTime) {
        const startStr = typeof planDetails.startTime === 'string' ? planDetails.startTime : new Date(planDetails.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const endStr = typeof planDetails.endTime === 'string' ? planDetails.endTime : new Date(planDetails.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        time = `${startStr} - ${endStr}`;
      } else {
        time = 'Standardschicht';
      }
    }

    // Warehouses list computation
    let warehousesList: string[] = [];
    if (Array.isArray(planDetails.warehouses) && planDetails.warehouses.length > 0) {
      warehousesList = planDetails.warehouses.map((w: any) => {
        if (typeof w === 'string') return w;
        if (w && typeof w === 'object') {
          const wName = w.warehouseName || w.warehouse?.name || 'Lager';
          const hName = w.hallName || w.hall?.name || '';
          return hName ? `${wName} (${hName})` : wName;
        }
        return 'Lagerort unbestimmt';
      });
    } else if (planDetails.locations && Array.isArray(planDetails.locations) && planDetails.locations.length > 0) {
      warehousesList = planDetails.locations.map((loc: any) => {
        const wName = loc.warehouseName || loc.warehouse?.name || planDetails.warehouseName || 'Lager';
        const hName = loc.hallName || loc.hall?.name || planDetails.hallName || '';
        return hName ? `${wName} (${hName})` : wName;
      });
    } else if (planDetails.warehouseName || planDetails.hallName) {
      const wName = planDetails.warehouseName || 'Lager';
      const hName = planDetails.hallName ? ` (${planDetails.hallName})` : '';
      warehousesList = [`${wName}${hName}`];
    } else {
      warehousesList = ['Lagerort zugewiesen'];
    }

    const notes = planDetails.notes || planDetails.description || 'Keine besonderen Hinweise hinterlegt.';
    const isUpdate = planDetails.isUpdate || false;
    const title = planDetails.title || (isUpdate ? 'Schichtplan aktualisiert' : 'Neue Schichtzuweisung');
    const subject = `${title}: ${date}`;

    const html = `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; font-family: 'Segoe UI', Inter, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .body-padding { padding: 32px 28px; }
    .badge { display: inline-block; background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 13px; margin: 3px 2px; }
    .btn-primary { display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3); transition: background-color 0.2s; }
    .note-card { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; color: #78350f; font-size: 14px; line-height: 1.6; margin-top: 20px; }
    
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; border-radius: 0 !important; border: none !important; }
      .body-padding { padding: 24px 16px !important; }
      .header { padding: 24px 16px !important; }
      .table-row-label { display: block !important; width: 100% !important; padding-bottom: 4px !important; }
      .table-row-value { display: block !important; width: 100% !important; padding-bottom: 16px !important; }
      .btn-primary { width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #f8fafc; font-family: 'Segoe UI', Inter, Helvetica, Arial, sans-serif; color: #1e293b;">
  <center style="width: 100%; background-color: #f8fafc;">
    <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; text-align: left;">
      
      <!-- Header Section -->
      <div class="header" style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); padding: 6px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 12px;">
          LogiFlow Operations
        </div>
        <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff;">
          ${isUpdate ? 'Schichtplan Aktualisiert' : 'Neue Schichtzuweisung'}
        </h1>
        <p style="margin: 6px 0 0; font-size: 14px; color: #dbeafe; opacity: 0.9;">
          ${title}
        </p>
      </div>
      
      <!-- Body Section -->
      <div class="body-padding" style="padding: 32px 28px;">
        <p style="margin: 0 0 16px; font-size: 16px; color: #334155; line-height: 1.5;">
          Hallo <strong style="color: #0f172a;">${employeeName}</strong>,
        </p>
        <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.5;">
          ${isUpdate ? 'Die Betriebsleitung hat Ihren Schichtplan aktualisiert. Bitte prüfen Sie Ihre neuen Einsatzdetails:' : 'Sie wurden für eine neue Schicht im Lager eingeteilt. Hier sind Ihre vollständigen Schichtdetails:'}
        </p>

        <!-- Details Table -->
        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px;">
          <tr>
            <td class="table-row-label" style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; font-size: 14px; width: 32%; background-color: #f1f5f9;">
              👤 Mitarbeiter
            </td>
            <td class="table-row-value" style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; font-size: 15px;">
              ${employeeName}
            </td>
          </tr>
          <tr>
            <td class="table-row-label" style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; font-size: 14px; width: 32%; background-color: #f1f5f9;">
              📅 Datum
            </td>
            <td class="table-row-value" style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #2563eb; font-size: 15px;">
              ${date}
            </td>
          </tr>
          <tr>
            <td class="table-row-label" style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; font-size: 14px; width: 32%; background-color: #f1f5f9;">
              ⏰ Uhrzeit
            </td>
            <td class="table-row-value" style="padding: 14px 18px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a; font-size: 15px;">
              ${time}
            </td>
          </tr>
          <tr>
            <td class="table-row-label" style="padding: 14px 18px; font-weight: 600; color: #64748b; font-size: 14px; width: 32%; background-color: #f1f5f9; vertical-align: top;">
              🏢 Lagerort(e)
            </td>
            <td class="table-row-value" style="padding: 14px 18px; font-weight: 600; color: #0f172a; font-size: 14px;">
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${warehousesList.map(w => `<span class="badge" style="display: inline-block; background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 6px 12px; border-radius: 6px; font-weight: 600; font-size: 13px; margin: 2px 0;">🏢 ${w}</span>`).join(' ')}
              </div>
            </td>
          </tr>
          ${planDetails.treffpunkt ? `
          <tr>
            <td class="table-row-label" style="padding: 14px 18px; border-top: 1px solid #e2e8f0; font-weight: 600; color: #64748b; font-size: 14px; width: 32%; background-color: #f1f5f9;">
              📍 Treffpunkt
            </td>
            <td class="table-row-value" style="padding: 14px 18px; border-top: 1px solid #e2e8f0; font-weight: 600; color: #0f172a; font-size: 14px;">
              ${planDetails.treffpunkt}${planDetails.treffpunktTime ? ` (⏰ ${planDetails.treffpunktTime})` : ''}
            </td>
          </tr>
          ` : ''}
          ${planDetails.containers && planDetails.containers.length > 0 ? `
          <tr>
            <td class="table-row-label" style="padding: 14px 18px; border-top: 1px solid #e2e8f0; font-weight: 600; color: #64748b; font-size: 14px; width: 32%; background-color: #f1f5f9;">
              📦 Container
            </td>
            <td class="table-row-value" style="padding: 14px 18px; border-top: 1px solid #e2e8f0; font-family: monospace; font-weight: 600; color: #0f172a; font-size: 13px;">
              ${planDetails.containers.join(', ')}
            </td>
          </tr>
          ` : ''}
        </table>
        
        <!-- Notes Section -->
        <div class="note-card" style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; color: #78350f; font-size: 14px; line-height: 1.6; margin-top: 20px;">
          <div style="font-weight: 700; margin-bottom: 6px; color: #b45309;">
            📝 Notizen & Anweisungen
          </div>
          <div style="color: #92400e;">
            ${notes}
          </div>
        </div>

        <!-- Call to Action Button (Dashboard) -->
        <div style="text-align: center; margin-top: 32px; margin-bottom: 12px;">
          <a href="${frontendUrl}/planning" class="btn-primary" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);">
            Zum Dashboard / Open Dashboard &rarr;
          </a>
        </div>
        <p style="text-align: center; font-size: 12px; color: #64748b; margin-top: 12px;">
          Klicken Sie auf den Button, um Ihren vollständigen Schichtplan im Portal anzuzeigen.
        </p>
      </div>
      
      <!-- Footer Section -->
      <div style="background-color: #f1f5f9; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; line-height: 1.5;">
        <p style="margin: 0 0 6px; font-weight: 600; color: #475569;">LogiFlow Warehouse Management System</p>
        <p style="margin: 0; color: #94a3b8;">Dies ist eine automatisierte Systembenachrichtigung für <strong>${employeeName}</strong>. Bitte antworten Sie nicht direkt auf diese E-Mail.</p>
      </div>
      
    </div>
  </center>
</body>
</html>`;
    return this.sendEmail(email, subject, html);
  }

  async sendPlanRemovalNotification(email: string, planDetails: any): Promise<string | true> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    
    const employeeName = planDetails.employeeName || 'Mitarbeiter';
    const date = planDetails.date || 'Nicht angegeben';
    const time = planDetails.time || 'Standardschicht';
    const notes = planDetails.notes || 'Sie wurden aus dieser Schicht ausgetragen. Ihr Dienstplan wurde aktualisiert.';
    
    let warehousesList: string[] = [];
    if (Array.isArray(planDetails.warehouses) && planDetails.warehouses.length > 0) {
      warehousesList = planDetails.warehouses.map((w: any) => typeof w === 'string' ? w : `${w.warehouseName || 'Lager'} (${w.hallName || 'Halle'})`);
    } else {
      warehousesList = [`${planDetails.warehouseName || 'Lager'} (${planDetails.hallName || 'Halle'})`];
    }

    const subject = `Schichtzuweisung entfernt: ${date}`;

    const html = `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; font-family: 'Segoe UI', Inter, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .body-padding { padding: 32px 28px; }
    .btn-primary { display: inline-block; background-color: #3b82f6; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 8px; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; border-radius: 0 !important; border: none !important; }
      .body-padding { padding: 24px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #f8fafc; font-family: 'Segoe UI', Inter, Helvetica, Arial, sans-serif; color: #1e293b;">
  <center style="width: 100%; background-color: #f8fafc;">
    <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; text-align: left;">
      
      <div class="header" style="background: linear-gradient(135deg, #7f1d1d 0%, #dc2626 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">Schichtzuweisung Entfernt</h1>
        <p style="margin: 6px 0 0; font-size: 14px; color: #fca5a5;">Dienstplanänderung / Shift Update</p>
      </div>
      
      <div class="body-padding" style="padding: 32px 28px;">
        <p style="margin: 0 0 16px; font-size: 16px; color: #334155;">Hallo <strong>${employeeName}</strong>,</p>
        <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.5;">
          Sie wurden von der Betriebsleitung aus folgendem Schichtplan ausgetragen:
        </p>

        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; width: 32%; background-color: #f1f5f9;">👤 Mitarbeiter</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${employeeName}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; width: 32%; background-color: #f1f5f9;">📅 Datum</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #dc2626;">${date}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; width: 32%; background-color: #f1f5f9;">⏰ Uhrzeit</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${time}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-weight: 600; color: #64748b; width: 32%; background-color: #f1f5f9;">🏢 Lagerort(e)</td>
            <td style="padding: 12px 16px; font-weight: 600; color: #0f172a;">${warehousesList.join(', ')}</td>
          </tr>
        </table>
        
        <div style="background-color: #fff1f2; border-left: 4px solid #f43f5e; padding: 16px; border-radius: 0 8px 8px 0; color: #881337; font-size: 14px; line-height: 1.6; margin-top: 20px;">
          <strong>📝 Notizen:</strong> ${notes}
        </div>

        <div style="text-align: center; margin-top: 32px; margin-bottom: 12px;">
          <a href="${frontendUrl}/planning" class="btn-primary" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
            Zum Dashboard / Open Dashboard &rarr;
          </a>
        </div>
      </div>
      
      <div style="background-color: #f1f5f9; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">
        <p style="margin: 0;">LogiFlow Warehouse Management System — Automatisierte Systembenachrichtigung</p>
      </div>
      
    </div>
  </center>
</body>
</html>`;
    return this.sendEmail(email, subject, html);
  }

  async sendPlanDeletionNotification(email: string, planDetails: any): Promise<string | true> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    
    const employeeName = planDetails.employeeName || 'Mitarbeiter';
    const date = planDetails.date || 'Nicht angegeben';
    const time = planDetails.time || 'Standardschicht';
    const notes = planDetails.notes || 'Dieser Schichtplan wurde von der Betriebsleitung komplett storniert bzw. abgesagt.';
    
    let warehousesList: string[] = [];
    if (Array.isArray(planDetails.warehouses) && planDetails.warehouses.length > 0) {
      warehousesList = planDetails.warehouses.map((w: any) => typeof w === 'string' ? w : `${w.warehouseName || 'Lager'} (${w.hallName || 'Halle'})`);
    } else {
      warehousesList = [`${planDetails.warehouseName || 'Lager'} (${planDetails.hallName || 'Halle'})`];
    }

    const subject = `Schichtplan abgesagt: ${date}`;

    const html = `<!DOCTYPE html>
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; font-family: 'Segoe UI', Inter, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #991b1b 0%, #ef4444 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .body-padding { padding: 32px 28px; }
    .btn-primary { display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 8px; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; border-radius: 0 !important; border: none !important; }
      .body-padding { padding: 24px 16px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #f8fafc; font-family: 'Segoe UI', Inter, Helvetica, Arial, sans-serif; color: #1e293b;">
  <center style="width: 100%; background-color: #f8fafc;">
    <div class="email-container" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; text-align: left;">
      
      <div class="header" style="background: linear-gradient(135deg, #991b1b 0%, #ef4444 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 800; color: #ffffff;">Schichtplan Abgesagt</h1>
        <p style="margin: 6px 0 0; font-size: 14px; color: #fee2e2;">Dienstplanstornierung / Shift Cancellation</p>
      </div>
      
      <div class="body-padding" style="padding: 32px 28px;">
        <p style="margin: 0 0 16px; font-size: 16px; color: #334155;">Hallo <strong>${employeeName}</strong>,</p>
        <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.5;">
          Der folgende Schichtplan wurde von der Betriebsleitung storniert bzw. abgesagt:
        </p>

        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; overflow: hidden; margin-bottom: 24px;">
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; width: 32%; background-color: #f1f5f9;">👤 Mitarbeiter</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${employeeName}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; width: 32%; background-color: #f1f5f9;">📅 Datum</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #dc2626;">${date}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #64748b; width: 32%; background-color: #f1f5f9;">⏰ Uhrzeit</td>
            <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #0f172a;">${time}</td>
          </tr>
          <tr>
            <td style="padding: 12px 16px; font-weight: 600; color: #64748b; width: 32%; background-color: #f1f5f9;">🏢 Lagerort(e)</td>
            <td style="padding: 12px 16px; font-weight: 600; color: #0f172a;">${warehousesList.join(', ')}</td>
          </tr>
        </table>
        
        <div style="background-color: #fff1f2; border-left: 4px solid #f43f5e; padding: 16px; border-radius: 0 8px 8px 0; color: #881337; font-size: 14px; line-height: 1.6; margin-top: 20px;">
          <strong>📝 Hinweis:</strong> ${notes}
        </div>

        <div style="text-align: center; margin-top: 32px; margin-bottom: 12px;">
          <a href="${frontendUrl}/planning" class="btn-primary" style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 700; font-size: 15px; text-decoration: none; padding: 14px 32px; border-radius: 8px;">
            Zum Dashboard / Open Dashboard &rarr;
          </a>
        </div>
      </div>
      
      <div style="background-color: #f1f5f9; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">
        <p style="margin: 0;">LogiFlow Warehouse Management System — Automatisierte Systembenachrichtigung</p>
      </div>
      
    </div>
  </center>
</body>
</html>`;
    return this.sendEmail(email, subject, html);
  }

  async sendCustomEmail(
    to: string,
    subject: string,
    message: string,
    senderName = 'LogiFlow',
  ): Promise<string | true> {
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: auto; background-color: #0d1117; color: #e2e8f0; border-radius: 12px; overflow: hidden; border: 1px solid #1e293b;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0058be 0%, #003a8c 100%); padding: 28px 36px; text-align: center;">
          <div style="display: inline-block; background: rgba(255,255,255,0.15); border-radius: 10px; padding: 10px 16px; margin-bottom: 12px;">
            <span style="font-size: 22px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px;">LogiFlow</span>
          </div>
          <h1 style="margin: 0; font-size: 18px; font-weight: 700; color: #ffffff;">${subject}</h1>
        </div>

        <!-- Body -->
        <div style="padding: 32px 36px;">
          <div style="background: #111827; border: 1px solid #1e293b; border-radius: 8px; padding: 20px 24px; line-height: 1.7; font-size: 14px; color: #e2e8f0; white-space: pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

          <p style="margin-top: 28px; text-align: center;">
            <a href="${frontendUrl}" style="display: inline-block; background: #0058be; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 30px; border-radius: 8px; letter-spacing: 0.3px;">
              Zum Dashboard →
            </a>
          </p>
        </div>

        <!-- Footer -->
        <div style="background: #060a0f; padding: 14px 36px; text-align: center; border-top: 1px solid #1e293b;">
          <p style="margin: 0; font-size: 11px; color: #334155;">LogiFlow Warehouse Management System — Nachricht von ${senderName}</p>
          <p style="margin: 4px 0 0 0; font-size: 11px; color: #334155;">Bitte antworten Sie nicht direkt auf diese E-Mail.</p>
        </div>
      </div>
    `;
    return this.sendEmail(to, subject, html);
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
    return this.sendEmailBool(email, subject, html);
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
    return this.sendEmailBool(email, subject, html);
  }
}
