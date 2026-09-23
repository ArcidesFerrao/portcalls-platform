// Root layout (§16): sidebar navigation + session banner. Next.js App Router shape.
export const metadata = { title: 'PortCalls — Evolure', description: 'Gestão operacional de escalas portuárias' };

export const NAV = [
  { href: '/portcalls', label: 'Escala de Navios' },
  { href: '/vessels', label: 'Navios' },
  { href: '/clients', label: 'Clientes' },
  { href: '/documents', label: 'Documentos' },
  { href: '/invoices', label: 'Faturas' },
  { href: '/settings', label: 'Configurações' },
  { href: '/admin', label: 'Administração', adminOnly: true },
];

export default function RootLayout(props: { children: string }) {
  return `<!doctype html><html lang="pt"><body><aside>${NAV.map(n => `<a href="${n.href}">${n.label}</a>`).join('')}</aside><main>${props.children}</main></body></html>`;
}
