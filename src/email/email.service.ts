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

  /** Ensures frontend URL always has a valid protocol (https:// or http://) and no trailing slash */
  private getFrontendUrl(): string {
    let url = (this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001').trim();
    url = url.replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(url)) {
      url = (url.includes('localhost') || url.includes('127.0.0.1'))
        ? `http://${url}`
        : `https://${url}`;
    }
    return url;
  }

  /** Renders bulletproof email button that works across all mobile & desktop email clients */
  private renderCtaButton(url: string, label = 'Zum Dashboard / Open Dashboard &rarr;'): string {
    return `
      <div style="text-align: center; margin: 32px 0 16px 0;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${url}" style="height:50px;v-text-anchor:middle;width:300px;" arcsize="16%" stroke="f" fillcolor="#2563eb">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:'Segoe UI',Inter,sans-serif;font-size:15px;font-weight:bold;">${label}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin: 0 auto; border-collapse: separate;">
          <tr>
            <td align="center" bgcolor="#2563eb" style="border-radius: 8px; background-color: #2563eb;">
              <a href="${url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 32px; font-family: 'Segoe UI', Inter, Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff !important; text-decoration: none; border-radius: 8px; border: 1px solid #2563eb; background-color: #2563eb; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.3);">
                ${label}
              </a>
            </td>
          </tr>
        </table>
        <!--<![endif]-->
      </div>
      <p style="text-align: center; font-size: 12px; color: #64748b; margin: 12px 0 0 0; line-height: 1.5;">
        Klicken Sie auf den Button, um Ihren vollständigen Schichtplan im Portal anzuzeigen.<br/>
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline; font-size: 12px; font-weight: 600; word-break: break-all;">${url}</a>
      </p>
    `;
  }

  async sendPlanNotification(email: string, planDetails: any): Promise<string | true> {
    const frontendUrl = this.getFrontendUrl();

    const employeeName = planDetails.employeeName || planDetails.name || 'Mitarbeiter';
    const date = planDetails.date || 'Nicht angegeben';
    const kw = planDetails.calendarWeek || planDetails.kw || '';

    // Level 1: Official Master Plan Time
    let masterTime = planDetails.masterShift || planDetails.shift || planDetails.time;
    if (!masterTime) {
      if (planDetails.startTime && planDetails.endTime) {
        const startStr = typeof planDetails.startTime === 'string' ? planDetails.startTime : new Date(planDetails.startTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const endStr = typeof planDetails.endTime === 'string' ? planDetails.endTime : new Date(planDetails.endTime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        masterTime = `${startStr} - ${endStr}`;
      } else {
        masterTime = '08:00 - 14:00 (Standardschicht)';
      }
    }

    // Level 2: Halls and Hall-Specific Times
    const rawLocations: any[] = planDetails.locations || planDetails.warehouses || [];
    const hallList: Array<{ name: string; warehouse: string; time: string; notes?: string }> = [];

    if (Array.isArray(rawLocations) && rawLocations.length > 0) {
      rawLocations.forEach((loc: any) => {
        if (typeof loc === 'string') {
          hallList.push({ name: loc, warehouse: 'Lager', time: masterTime });
        } else if (loc && typeof loc === 'object') {
          const wName = loc.warehouseName || loc.warehouse?.name || planDetails.warehouseName || 'Lager';
          const hName = loc.hallName || loc.hall?.name || planDetails.hallName || 'Halle';
          let hTime = '';
          if (loc.startTime) {
            if (loc.isOpenEnd || !loc.endTime) {
              hTime = `${loc.startTime} - Offen`;
            } else {
              hTime = `${loc.startTime} - ${loc.endTime}`;
            }
          } else {
            hTime = masterTime;
          }
          hallList.push({
            name: hName,
            warehouse: wName,
            time: hTime,
            notes: loc.notes || undefined,
          });
        }
      });
    } else if (planDetails.warehouseName || planDetails.hallName) {
      hallList.push({
        name: planDetails.hallName || 'Halle',
        warehouse: planDetails.warehouseName || 'Lager',
        time: masterTime,
      });
    }

    // Level 3: Employee Segments
    const segments: Array<{
      order: number;
      treffpunkt: string;
      treffpunktTime?: string;
      startTime: string;
      endTime?: string;
      netHours: number;
      notes?: string;
    }> = [];

    let totalNetHours = 0;
    if (Array.isArray(planDetails.segments) && planDetails.segments.length > 0) {
      planDetails.segments.forEach((seg: any, idx: number) => {
        let netHours = 0;
        if (seg.startTime && seg.endTime) {
          const [h1, m1] = seg.startTime.split(':').map(Number);
          const [h2, m2] = seg.endTime.split(':').map(Number);
          if (!isNaN(h1) && !isNaN(m1) && !isNaN(h2) && !isNaN(m2)) {
            let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
            if (diff < 0) diff += 24 * 60;
            netHours = Math.round((diff / 60) * 100) / 100;
          }
        }
        totalNetHours += netHours;
        segments.push({
          order: seg.order !== undefined ? seg.order + 1 : idx + 1,
          treffpunkt: seg.treffpunkt || 'Büro',
          treffpunktTime: seg.treffpunktTime || undefined,
          startTime: seg.startTime || '08:00',
          endTime: seg.endTime || 'Offen',
          netHours,
          notes: seg.notes || undefined,
        });
      });
    }

    // Absence Info
    const absence = planDetails.absence;

    const notes = planDetails.notes || planDetails.description || 'Keine besonderen Hinweise hinterlegt.';
    const isUpdate = planDetails.isUpdate || false;
    const title = planDetails.title || (isUpdate ? 'Schichtplan aktualisiert' : 'Neue Schichtzuweisung');
    const subject = `${title}: ${date}${kw ? ` (KW ${kw})` : ''}`;

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
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; font-family: 'Segoe UI', Inter, -apple-system, BlinkMacSystemFont, Roboto, sans-serif; background-color: #f1f5f9; color: #0f172a; }
    .email-container { max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08); }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #2563eb 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
    .section-card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 18px; margin-bottom: 20px; }
    .badge-amber { display: inline-block; background-color: #fef3c7; color: #92400e; border: 1px solid #fde68a; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; }
    .badge-blue { display: inline-block; background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; }
    .badge-green { display: inline-block; background-color: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 12px; }
    @media screen and (max-width: 600px) {
      .email-container { width: 100% !important; border-radius: 0 !important; border: none !important; }
      .body-padding { padding: 20px 14px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: #f1f5f9; font-family: 'Segoe UI', Inter, sans-serif; color: #0f172a;">
  <center style="width: 100%;">
    <div class="email-container" style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #cbd5e1; text-align: left;">
      
      <!-- Top Header -->
      <div class="header" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #2563eb 100%); padding: 32px 24px; text-align: center; color: #ffffff;">
        <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.18); padding: 5px 14px; border-radius: 20px; font-size: 11px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.25);">
          LogiFlow Operations Plan
        </div>
        <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.4px; color: #ffffff;">
          ${isUpdate ? 'Schichtplan Aktualisiert' : 'Neue Schichtzuweisung'}
        </h1>
        <p style="margin: 8px 0 0; font-size: 15px; color: #dbeafe; font-weight: 600;">
          📅 ${date} ${kw ? `<span style="opacity: 0.85;">(Kalenderwoche ${kw})</span>` : ''}
        </p>
      </div>

      <!-- Main Body Content -->
      <div class="body-padding" style="padding: 28px 26px;">
        <p style="margin: 0 0 16px; font-size: 16px; color: #1e293b; line-height: 1.5;">
          Hallo <strong style="color: #0f172a; font-size: 17px;">${employeeName}</strong>,
        </p>
        <p style="margin: 0 0 22px; font-size: 14px; color: #475569; line-height: 1.6;">
          ${isUpdate
            ? 'die Betriebsleitung hat Ihren Schichtplan aktualisiert. Nachfolgend finden Sie die vollständigen Details zu Master-Arbeitszeit, Hallen-Zeiten und Ihren individuellen Treffpunkten:'
            : 'Sie wurden für einen Schichteinsatz eingeteilt. Nachfolgend finden Sie die vollständigen Details zu Master-Arbeitszeit, Hallen-Zeiten und Ihren individuellen Treffpunkten:'}
        </p>

        <!-- Optional Absence Notice -->
        ${absence ? `
        <div style="background-color: #fef2f2; border: 2px solid #fca5a5; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 800; color: #991b1b; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
            ⚠️ Abwesenheits-Status für diesen Tag hinterlegt:
          </div>
          <p style="margin: 0; font-size: 13px; color: #b91c1c; font-weight: 600;">
            Status: <strong>${absence.status === 'KRANK' ? '🟡 Krank' : absence.status === 'ABWESEND_GRUND' ? '🔵 Abwesend (mit Grund)' : '🔴 Nicht gearbeitet'}</strong>
            ${absence.reason ? ` &bull; Grund: ${absence.reason}` : ''}
            ${absence.notes ? ` &bull; Notiz: ${absence.notes}` : ''}
          </p>
        </div>
        ` : ''}

        <!-- Level 1: Official Master Plan Schedule -->
        <div class="section-card" style="background-color: #f8fafc; border: 1.5px solid #bfdbfe; border-left: 5px solid #2563eb; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #1e40af; margin-bottom: 8px;">
            🏛️ Ebene 1: Offizieller Schichtplan (Master-Arbeitszeit)
          </div>
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 4px 0; font-size: 13px; color: #64748b; width: 35%; font-weight: 600;">Offizielle Arbeitszeit:</td>
              <td style="padding: 4px 0; font-size: 15px; color: #0f172a; font-weight: 800; font-family: monospace;">
                ${masterTime}
              </td>
            </tr>
            <tr>
              <td style="padding: 4px 0; font-size: 13px; color: #64748b; font-weight: 600;">Einsatzdatum:</td>
              <td style="padding: 4px 0; font-size: 14px; color: #0f172a; font-weight: 700;">
                ${date} ${kw ? `(KW ${kw})` : ''}
              </td>
            </tr>
          </table>
        </div>

        <!-- Level 2: Hall-Specific Schedules -->
        <div class="section-card" style="background-color: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #475569; margin-bottom: 10px;">
            🏢 Ebene 2: Hallen-Einsatzorte & Arbeitszeiten (${hallList.length})
          </div>
          <table role="presentation" style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <thead>
              <tr style="background-color: #e2e8f0; color: #334155; font-size: 11px; text-transform: uppercase; font-weight: 700;">
                <th style="padding: 8px 10px; text-align: left; border-radius: 6px 0 0 6px;">Lager / Halle</th>
                <th style="padding: 8px 10px; text-align: right; border-radius: 0 6px 6px 0;">Hallen-Arbeitszeit</th>
              </tr>
            </thead>
            <tbody>
              ${hallList.map((h, i) => `
                <tr style="border-bottom: ${i < hallList.length - 1 ? '1px solid #e2e8f0' : 'none'};">
                  <td style="padding: 10px; font-weight: 700; color: #0f172a;">
                    🏢 ${h.warehouse} &mdash; <span style="color: #1d4ed8;">${h.name}</span>
                    ${h.notes ? `<div style="font-size: 11px; color: #64748b; font-weight: normal; margin-top: 2px;">${h.notes}</div>` : ''}
                  </td>
                  <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: 800; color: #1e293b;">
                    <span style="background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; padding: 3px 8px; border-radius: 6px;">${h.time}</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Level 3: Employee-Specific Segments & Pickup Times -->
        <div class="section-card" style="background-color: #ffffff; border: 2px solid #cbd5e1; border-radius: 12px; padding: 18px; margin-bottom: 24px; box-shadow: 0 4px 6px -2px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 12px;">
            <div>
              <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a;">
                👤 Ebene 3: Ihr persönlicher Einsatzplan & Treffpunkte
              </div>
              <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                ⏰ <em>Treffzeit ist Abholzeit (keine Arbeitszeit) &bull; Arbeitszeit beginnt ab Einsatzort</em>
              </div>
            </div>
            ${totalNetHours > 0 ? `
              <span style="background-color: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; font-size: 13px; font-weight: 800; padding: 4px 10px; border-radius: 8px;">
                Total: ${totalNetHours.toFixed(1)} h
              </span>
            ` : ''}
          </div>

          ${segments.length > 0 ? `
            <table role="presentation" style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background-color: #f1f5f9; color: #475569; font-size: 11px; text-transform: uppercase; font-weight: 800;">
                  <th style="padding: 8px 10px; text-align: left;">⏰ Treffzeit</th>
                  <th style="padding: 8px 10px; text-align: left;">📍 Treffpunkt / Ort</th>
                  <th style="padding: 8px 10px; text-align: left;">🕒 Arbeitszeit</th>
                  <th style="padding: 8px 10px; text-align: right;">Netto</th>
                </tr>
              </thead>
              <tbody>
                ${segments.map((seg, idx) => `
                  <tr style="border-bottom: ${idx < segments.length - 1 ? '1px solid #f1f5f9' : 'none'}; background-color: ${idx % 2 === 0 ? '#ffffff' : '#fafafa'};">
                    <td style="padding: 10px; font-family: monospace; font-weight: 800; color: #92400e;">
                      ${seg.treffpunktTime ? `<span style="background-color: #fef3c7; border: 1px solid #fde68a; padding: 3px 8px; border-radius: 6px;">⏰ ${seg.treffpunktTime}</span>` : '<span style="color: #94a3b8;">&mdash;</span>'}
                    </td>
                    <td style="padding: 10px; font-weight: 700; color: #0f172a;">
                      ${seg.treffpunkt}
                      ${seg.notes ? `<div style="font-size: 11px; color: #64748b; font-weight: normal;">${seg.notes}</div>` : ''}
                    </td>
                    <td style="padding: 10px; font-family: monospace; font-weight: 800; color: #1e40af;">
                      ${seg.startTime} &ndash; ${seg.endTime}
                    </td>
                    <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: 800; color: #0f172a;">
                      ${seg.netHours > 0 ? `${seg.netHours.toFixed(1)} h` : '&mdash;'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <div style="padding: 12px; background-color: #f8fafc; border-radius: 8px; font-size: 13px; color: #334155; line-height: 1.6;">
              <p style="margin: 0;">Sie sind für die offizielle Master-Schicht eingeteilt:</p>
              <p style="margin: 4px 0 0; font-weight: 800; font-family: monospace; color: #1e40af;">
                🕒 ${masterTime}
                ${planDetails.treffpunkt ? ` &bull; 📍 Treffpunkt: ${planDetails.treffpunkt} ${planDetails.treffpunktTime ? `(⏰ ${planDetails.treffpunktTime})` : ''}` : ''}
              </p>
            </div>
          `}
        </div>

        <!-- Optional Assigned Containers -->
        ${planDetails.containers && planDetails.containers.length > 0 ? `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 6px;">
            📦 Zugewiesene Container (${planDetails.containers.length}):
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${planDetails.containers.map((c: string) => `<span style="display: inline-block; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 6px; font-family: monospace; font-size: 12px; font-weight: 700; color: #1e293b; margin: 2px;">${c}</span>`).join(' ')}
          </div>
        </div>
        ` : ''}

        <!-- Notes Section -->
        <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 10px 10px 0; padding: 14px 18px; color: #78350f; font-size: 13px; line-height: 1.6; margin-bottom: 24px;">
          <strong style="color: #b45309; display: block; margin-bottom: 4px; font-size: 13px;">📝 Notizen & Anweisungen der Betriebsleitung:</strong>
          <div>${notes}</div>
        </div>

        <!-- Call to Action Button (Dashboard) -->
        ${this.renderCtaButton(frontendUrl, 'Zum Portal & Details ansehen &rarr;')}
      </div>
      
      <!-- Footer Section -->
      <div style="background-color: #f1f5f9; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 12px; line-height: 1.5;">
        <p style="margin: 0 0 4px; font-weight: 700; color: #334155;">LogiFlow Warehouse Management System</p>
        <p style="margin: 0; color: #94a3b8;">Automatische Dienstplan-Benachrichtigung für <strong>${employeeName}</strong> &bull; Empfangen an ${email}</p>
      </div>
      
    </div>
  </center>
</body>
</html>`;
    return this.sendEmail(email, subject, html);
  }

  async sendPlanRemovalNotification(email: string, planDetails: any): Promise<string | true> {
    const frontendUrl = this.getFrontendUrl();
    
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

        ${this.renderCtaButton(frontendUrl, 'Zum Dashboard / Open Dashboard &rarr;')}
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
    const frontendUrl = this.getFrontendUrl();
    
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

        ${this.renderCtaButton(frontendUrl, 'Zum Dashboard / Open Dashboard &rarr;')}
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
    const frontendUrl = this.getFrontendUrl();
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
    const frontendUrl = this.getFrontendUrl();
    const subject = 'Willkommen bei LogiFlow';
    const html = `
      <div style="font-family: 'Segoe UI', Inter, Helvetica, Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1e293b;">
        <h2 style="color: #2563eb; margin-top: 0;">Willkommen bei LogiFlow!</h2>
        <p>Hallo <strong>${name}</strong>,</p>
        <p>Ihr Account im LogiFlow Warehouse Management System wurde erfolgreich erstellt.</p>
        <p>Sie können sich nun unter Verwendung Ihrer Telefonnummer und Ihres Passworts einloggen.</p>
        ${this.renderCtaButton(frontendUrl, 'Zum Dashboard / Login &rarr;')}
        <p style="margin-top: 20px; font-size: 14px; color: #64748b;">Wir freuen uns auf die Zusammenarbeit!</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 24px;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center;">Dies ist eine automatisierte Nachricht von LogiFlow.</p>
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
