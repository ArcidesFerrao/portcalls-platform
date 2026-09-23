// Notifications bounded context: template registry + channel ports (§8 consumer).
export type Channel = 'email' | 'whatsapp' | 'inapp';

export interface NotificationMessage { to: string; subject: string; body: string; }
export interface ChannelSender { send(msg: NotificationMessage): Promise<void>; }

const TEMPLATES: Record<string, (p: Record<string, string>) => NotificationMessage> = {
  milestone_overdue: p => ({
    to: p.email, subject: `[PortCalls] Milestone em atraso: ${p.milestone}`,
    body: `A milestone "${p.milestone}" (${p.authority}) da escala ${p.reference} está overdue desde ${p.plannedAt}.`,
  }),
  portcall_closed: p => ({
    to: p.email, subject: `[PortCalls] Escala fechada: ${p.reference}`,
    body: `A escala ${p.reference} em ${p.portCode} foi fechada com sucesso.`,
  }),
  invoice_paid: p => ({
    to: p.email, subject: `[PortCalls] Fatura ${p.number} paga`,
    body: `Recebemos o pagamento da fatura ${p.number} no valor de €${(Number(p.amountCents) / 100).toFixed(2)}.`,
  }),
};

export class NotificationService {
  constructor(private senders: Map<Channel, ChannelSender>) {}
  render(template: keyof typeof TEMPLATES, params: Record<string, string>): NotificationMessage {
    const fn = TEMPLATES[template];
    if (!fn) throw new Error(`Unknown notification template: ${String(template)}`);
    return fn(params);
  }
  async dispatch(channel: Channel, msg: NotificationMessage): Promise<void> {
    const sender = this.senders.get(channel);
    if (!sender) throw new Error(`No sender configured for channel ${channel}`);
    await sender.send(msg);
  }
}
