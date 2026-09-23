// Notification channel senders (§8 consumer): email (SMTP/SES port) + WhatsApp.
import type { ChannelSender, NotificationMessage } from '@portcalls/domain';

export interface SmtpTransport { send(from: string, to: string, subject: string, body: string): Promise<void>; }
export interface WhatsAppApi { sendMessage(phone: string, body: string): Promise<void>; }

export class EmailSender implements ChannelSender {
  constructor(private transport: SmtpTransport, private from: string) {}
  send(msg: NotificationMessage): Promise<void> { return this.transport.send(this.from, msg.to, msg.subject, msg.body); }
}

export class WhatsAppSender implements ChannelSender {
  constructor(private api: WhatsAppApi) {}
  async send(msg: NotificationMessage): Promise<void> { await this.api.sendMessage(msg.to, `${msg.subject}\n\n${msg.body}`); }
}

/** Dev/log sender — records messages in memory (used by smoke tests). */
export class ConsoleSender implements ChannelSender {
  public sent: NotificationMessage[] = [];
  async send(msg: NotificationMessage): Promise<void> { this.sent.push(msg); }
}
