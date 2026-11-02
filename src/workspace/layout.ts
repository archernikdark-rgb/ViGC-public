export interface WorkspaceLayout { sidebar: number; graph: number; playback: number }
export type Divider = keyof WorkspaceLayout;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(value, maximum));

export function resizeLayout(layout: WorkspaceLayout, divider: Divider, delta: number, width: number, height: number): WorkspaceLayout {
  if (!Number.isFinite(delta)) return layout;
  const maximum = divider === 'playback' ? Math.max(108, height - 360)
    : Math.max(200, width - (divider === 'sidebar' ? layout.graph : layout.sidebar) - 360);
  const minimum = divider === 'playback' ? 108 : 200;
  return { ...layout, [divider]: clamp(layout[divider] + delta, minimum, maximum) };
}
