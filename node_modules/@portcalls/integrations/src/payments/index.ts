// Payments adapter port + Stripe-style webhook signature verification (§17).
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentGateway } from '@portcalls/control-plane';

export function verifyStripeLikeSignature(rawBody: string, header: string, secret: string): boolean {
  // header format: "t=1710000000,v1=hex..."
  const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=') as [string, string]));
  const t = parts['t']; const v1 = parts['v1'];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replay window 5 min
  const mac = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  try { return timingSafeEqual(Buffer.from(mac), Buffer.from(v1)); } catch { return false; }
}

export class StripeGateway implements PaymentGateway {
  constructor(private apiKey: string, private webhookSecret: string) {}
  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return verifyStripeLikeSignature(rawBody, signature, this.webhookSecret);
  }
  async createCheckout(subscriptionId: string, amountCents: number, currency: string): Promise<{ url: string; reference: string }> {
    // In production: POST https://api.stripe.com/v1/checkout/sessions using this.apiKey.
    const ref = `cs_${subscriptionId.slice(0, 8)}_${amountCents}_${currency}`;
    return { url: `https://checkout.stripe.com/c/pay/${ref}`, reference: ref };
  }
}
void createHmac;
