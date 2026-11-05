import type { SupportedLanguage } from './whatsapp-self-service.service';

export type WorkerReplyKey = 'NO_PENDING' | 'MULTIPLE_PENDING' | 'MULTIPLE_NOTES' | 'NOTE_SAVED';
const replies: Record<WorkerReplyKey, Record<SupportedLanguage, string>> = {
  NO_PENDING: {
    de: 'ℹ️ Für dich liegt gerade keine offene Schicht zur Bestätigung vor.',
    tr: 'ℹ️ Şu anda onayını bekleyen açık bir vardiyan yok.',
    ar: 'ℹ️ ما عندك حالياً شفت مفتوح بانتظار تأكيدك.',
    uk: 'ℹ️ Зараз немає відкритої зміни, яка очікує на твоє підтвердження.',
  },
  MULTIPLE_PENDING: {
    de: '📅 Mehrere Schichten warten auf deine Antwort.\n💬 Nutze bitte die Schaltflächen in der jeweiligen Plan-Nachricht.',
    tr: '📅 Birden fazla vardiya yanıtını bekliyor.\n💬 Lütfen ilgili plan mesajındaki düğmeleri kullan.',
    ar: '📅 في أكثر من شفت بانتظار ردك.\n💬 استخدم أزرار رسالة الشفت المقصود.',
    uk: '📅 Кілька змін очікують на твою відповідь.\n💬 Скористайся кнопками у повідомленні з планом потрібної зміни.',
  },
  MULTIPLE_NOTES: {
    de: '📅 Mehrere Schichten warten auf deine Nachricht.\n👤 Wende dich bitte an die Schichtleitung, damit sie richtig zugeordnet wird.',
    tr: '📅 Birden fazla vardiya mesajını bekliyor.\n👤 Mesajın doğru vardiyaya atanması için vardiya sorumlusuyla iletişime geç.',
    ar: '📅 في أكثر من شفت بانتظار رسالتك.\n👤 تواصل مع مسؤول الشفت حتى تنربط رسالتك بالشفت الصحيح.',
    uk: '📅 Кілька змін очікують на твоє повідомлення.\n👤 Звернися до керівника зміни, щоб його правильно прив’язали.',
  },
  NOTE_SAVED: {
    de: '✅ Deine Nachricht wurde für die Schichtleitung gespeichert.',
    tr: '✅ Mesajın vardiya sorumlusu için kaydedildi.',
    ar: '✅ تم حفظ رسالتك لمسؤول الشفت.',
    uk: '✅ Твоє повідомлення збережено для керівника зміни.',
  },
};
export function workerReply(key: WorkerReplyKey, language: SupportedLanguage): string {
  return replies[key][language];
}
