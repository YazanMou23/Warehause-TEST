import { TranslationKey } from "./translations";
export function documentStatusLabel(status: string, t: (key: TranslationKey) => string): string {
 const key: Record<string, TranslationKey> = {COMPLETED:"completed", PROCESSING:"processing", OCR_PROCESSING:"processing", AI_ANALYZING:"processing", PERSISTING:"processing", PAUSED:"paused", FAILED:"failed", CANCELLED:"cancelled", SKIPPED:"skipped", QUEUED:"waiting", CREATED:"waiting", UPLOADING:"waiting", UPLOADED:"waiting"};
 return key[status] ? t(key[status]) : status;
}
