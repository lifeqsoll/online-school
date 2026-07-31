export const MAIL_SENDER = 'MAIL_SENDER';

export interface MailSender {
  sendPasswordReset(email: string, token: string): Promise<void>;
  sendEmailChangeCode(email: string, code: string): Promise<void>;
}
