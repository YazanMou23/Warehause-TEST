export type ConfirmationMessageState =
  | 'NONE'
  | 'AWAITING_TEXT'
  | 'RECEIVED'
  | 'EMPTY';

// The text channel wins over the marker comparison: a worker may literally send the marker text.
export function confirmationMessage(assignment: {
  confirmationStatus?: string | null;
  responseNote?: string | null;
  responseChannel?: string | null;
}) {
  const text = assignment.responseNote?.trim() ? assignment.responseNote : null;
  const custom = assignment.confirmationStatus === 'CUSTOM_RESPONSE';
  if (
    custom &&
    assignment.responseChannel !== 'WHATSAPP_TEXT' &&
    text === 'Wartet auf individuelle Textnachricht'
  ) {
    return { messageState: 'AWAITING_TEXT' as const, messageText: null };
  }
  if (text && (custom || assignment.responseChannel === 'WHATSAPP_TEXT')) {
    return { messageState: 'RECEIVED' as const, messageText: text };
  }
  return {
    messageState: (custom ? 'EMPTY' : 'NONE') as ConfirmationMessageState,
    messageText: null,
  };
}
