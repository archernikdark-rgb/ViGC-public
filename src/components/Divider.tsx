import type { PointerEvent } from 'react';
import type { Divider as DividerName } from '../workspace/layout.ts';
export function Divider({ name, value, onResize, controls=[] }: { controls?:{label:string;symbol:string;disabled?:boolean;onClick:()=>void}[]; name: DividerName; value: number; onResize: (name: DividerName, delta: number) => void }) {
  const horizontal = name === 'playback';
  function start(event: PointerEvent<HTMLDivElement>) {
    if((event.target as HTMLElement).closest('button'))return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.previous = String(horizontal ? event.clientY : event.clientX);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const coordinate = horizontal ? event.clientY : event.clientX;
    const previous = Number(event.currentTarget.dataset.previous);
    event.currentTarget.dataset.previous = String(coordinate);
    onResize(name, (coordinate - previous) * (name === 'sidebar' ? 1 : -1));
  }
  return <div className={`divider ${horizontal ? 'horizontal' : ''}`} role="group" tabIndex={-1}
    aria-label={{ sidebar: 'Ширина инспектора', graph: 'Ширина схемы', playback: 'Высота проигрывания' }[name]}
    aria-orientation={horizontal ? 'horizontal' : 'vertical'} aria-valuenow={Math.round(value)}
    aria-valuemin={horizontal ? 108 : 200} aria-valuemax={Math.max(value, horizontal ? window.innerHeight - 360 : window.innerWidth - 360)}
    aria-valuetext={`${Math.round(value)} пикселей`}
    onPointerDown={start} onPointerMove={move} onPointerUp={event => {if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
    onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); onResize(name, ['ArrowRight', 'ArrowUp'].includes(event.key) ? 16 : -16);
    }}><span role="separator" tabIndex={0} aria-label="Изменить размер области" aria-orientation={horizontal?'horizontal':'vertical'} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={horizontal?window.innerHeight:window.innerWidth}/>{controls.length>0&&<div className="divider-controls">{controls.filter(control=>!control.disabled).map(control=><button key={control.label} aria-label={control.label} title={control.label} disabled={control.disabled} onKeyDown={event=>event.stopPropagation()} onClick={control.onClick}>{control.symbol}</button>)}</div>}</div>;
}
