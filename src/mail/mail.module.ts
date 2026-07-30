import { Global, Module } from '@nestjs/common';
import { DevMailSender } from './dev-mail.sender';
import { MAIL_SENDER } from './mail.sender';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_SENDER,
      useClass: DevMailSender,
    },
  ],
  exports: [MAIL_SENDER],
})
export class MailModule {}
