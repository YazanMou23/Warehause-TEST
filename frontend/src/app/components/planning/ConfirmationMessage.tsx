'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, MessageSquare, X } from 'lucide-react';
import { useTranslation } from '../../i18n/LanguageContext';

interface MessageRecord {
  employeeName: string;
  formattedDate: string;
  shiftTime: string;
  warehouseName: string;
  hallName: string;
  messageState?: 'NONE' | 'AWAITING_TEXT' | 'RECEIVED' | 'EMPTY';
  messageText?: string | null;
  respondedAt?: string | null;
  responseChannel?: string | null;
}
export default function ConfirmationMessage({
  record,
}: {
  record: MessageRecord;
}) {
  const { t, locale } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const trigger = opener.current;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'Tab') {
        const buttons =
          panel.current?.querySelectorAll<HTMLButtonElement>('button');
        if (!buttons?.length) return;
        const first = buttons[0],
          last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', key);
      trigger?.focus();
    };
  }, [open]);
  if (!record.messageState || record.messageState === 'NONE') return null;
  const received =
    record.messageState === 'RECEIVED' && Boolean(record.messageText?.trim());
  const label = received
    ? t('confirmationMessageReceived')
    : record.messageState === 'AWAITING_TEXT'
      ? t('confirmationMessageAwaiting')
      : t('confirmationMessageEmpty');
  const timestamp = record.respondedAt ? new Date(record.respondedAt) : null;
  const timeLabel =
    timestamp && !Number.isNaN(timestamp.getTime())
      ? timestamp.toLocaleString(locale, {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : t('confirmationMessageUnknownTime');
  const channel =
    record.responseChannel === 'WHATSAPP_TEXT'
      ? t('planning865')
      : record.responseChannel === 'WHATSAPP_BUTTON'
        ? t('planning864')
        : record.responseChannel === 'MANUAL'
          ? t('planning866')
          : t('confirmationMessageUnknownChannel');
  return (
    <>
      <div
        className={`mt-2 max-w-sm rounded-xl border p-2.5 text-xs ${received ? 'border-primary/20 bg-primary/5 text-slate-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}
      >
        <div className="flex items-start gap-2 font-bold">
          {received ? (
            <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Clock className="h-4 w-4 shrink-0" />
          )}
          <span>{label}</span>
        </div>
        {received && (
          <>
            <p
              dir="auto"
              className="mt-1 line-clamp-3 whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
            >
              {record.messageText}
            </p>
            <button
              ref={opener}
              type="button"
              className="btn-secondary mt-2 min-h-9 px-3 text-xs"
              onClick={() => setOpen(true)}
            >
              {t('confirmationMessageView')}
            </button>
          </>
        )}
      </div>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label={t('confirmationMessageView')}
              className="flex max-h-[85dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
                <div>
                  <h3 className="font-bold text-primary">
                    {t('confirmationMessageReceived')}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {record.employeeName}
                  </p>
                </div>
                <button
                  ref={close}
                  type="button"
                  className="btn-secondary h-9 w-9 shrink-0 p-0"
                  aria-label={t('close')}
                  onClick={() => setOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="overflow-y-auto p-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <p>
                    {record.formattedDate} ·{' '}
                    <bdi dir="ltr">{record.shiftTime}</bdi>
                  </p>
                  <p className="mt-1 break-words">
                    {record.warehouseName} / {record.hallName}
                  </p>
                  <p className="mt-1">
                    {channel} · <bdi>{timeLabel}</bdi>
                  </p>
                  <p className="mt-1">{t('confirmationMessageRecordedTime')}</p>
                </div>
                <p
                  dir="auto"
                  className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900 [overflow-wrap:anywhere]"
                >
                  {record.messageText}
                </p>
              </div>
              <div className="flex justify-end border-t border-slate-200 p-4">
                <button
                  type="button"
                  className="btn-primary min-h-9 px-4 text-sm"
                  onClick={() => setOpen(false)}
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
