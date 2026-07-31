import { Injectable, Logger } from '@nestjs/common';
import { MailSender } from './mail.sender';

@Injectable()
export class DevMailSender implements MailSender {
  private readonly logger = new Logger(DevMailSender.name);

  async sendPasswordReset(email: string, token: string): Promise<void> {
    this.logger.log(
      `[DEV MAIL] Password reset for ${email}. Token: ${token}`,
    );
  }

  async sendEmailChangeCode(email: string, code: string): Promise<void> {
    this.logger.log(
      `[DEV MAIL] Email change code for ${email}. Code: ${code}`,
    );
  }
}
