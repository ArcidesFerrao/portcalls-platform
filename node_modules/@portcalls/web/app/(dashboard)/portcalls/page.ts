// Escala de Navios (§4): Kanban board + Timeline views over open port calls.
export const views = ['kanban', 'timeline'] as const;
export default function PortCallsPage() {
  return `<section data-views="kanban,timeline"><h1>Escala de Navios</h1><div class="board" id="lane-draft|scheduled|in_progress|completed|closed"></div></section>`;
}
