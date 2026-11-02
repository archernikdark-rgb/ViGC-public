import type { SceneShape, ShapeKind } from './document.ts';

export const shapeLabels: Record<ShapeKind, string> = {
 circle:'Круг', point:'Точка', rectangle:'Прямоугольник', polygon:'Многоугольник',
 chart:'Чарт', arrow:'Стрелка', comment:'Комментарий', text:'Текст', value:'Значение',
};
export const geometryLabels = { radius:'Радиус', width:'Ширина', height:'Высота', sides:'Стороны', innerRadius:'Внутренний радиус', fillPercent:'Заполнение, %', rotation:'Поворот, °', transparency:'Непрозрачность, %' } as const;
export type ShapeProperty = keyof typeof geometryLabels;
export const geometryDefaults: Record<ShapeProperty, number> = {radius:90,width:160,height:100,sides:5,innerRadius:45,fillPercent:75,rotation:0,transparency:30};
export function shapeProperties(kind:ShapeKind): ShapeProperty[] {
 const geometry:ShapeProperty[]=kind==='rectangle'||kind==='arrow'?['width','height']:kind==='polygon'?['radius','sides']:kind==='chart'?['radius','innerRadius','fillPercent']:kind==='circle'?['radius']:[];
 return [...geometry, ...(kind==='point'||kind==='comment'||kind==='text'||kind==='value'?[]:['rotation' as const]), 'transparency'];
}
export function geometryValue(shape:SceneShape, property:ShapeProperty):number { return shape[property] ?? geometryDefaults[property]; }
export function validateGeometry(shape:SceneShape):void {
 for(const property of shapeProperties(shape.kind)) {
  const value=geometryValue(shape,property);
  if(!Number.isFinite(value))throw Error(`${geometryLabels[property]}: введите конечное число.`);
  if(['radius','width','height'].includes(property)&&value<=0)throw Error(`${geometryLabels[property]}: значение должно быть больше нуля.`);
  if(property==='sides'&&(!Number.isInteger(value)||value<3||value>128))throw Error('Количество сторон — целое число от 3 до 128.');
  if((property==='fillPercent'||property==='transparency')&&(value<0||value>100))throw Error(`${geometryLabels[property]}: допустимо от 0 до 100.`);
 }
 if(shape.kind==='chart'&&(geometryValue(shape,'innerRadius')<0||geometryValue(shape,'innerRadius')>=shape.radius))throw Error('Внутренний радиус должен быть от нуля до внешнего радиуса, не включая его.');
 if(shape.geometryLocked!==undefined&&typeof shape.geometryLocked!=='boolean')throw Error('Некорректная блокировка геометрии.');
 if(shape.collisionEnabled!==undefined&&typeof shape.collisionEnabled!=='boolean')throw Error('Некорректная настройка столкновений.');
 if(shape.anchors!==undefined){if(!Array.isArray(shape.anchors)||shape.anchors.length>64)throw Error('Не больше 64 точек привязки.');const ids=new Set<string>();for(const a of shape.anchors){if(!a.id||ids.has(a.id)||typeof a.name!=='string'||!a.name.trim()||!Number.isFinite(a.x)||!Number.isFinite(a.y))throw Error('Некорректная точка привязки.');ids.add(a.id);}}
 if(shape.labelVisible!==undefined&&typeof shape.labelVisible!=='boolean')throw Error('Некорректная видимость подписи.');
 if(shape.comment!==undefined&&typeof shape.comment!=='string')throw Error('Некорректный комментарий.');
 if(shape.collapsed!==undefined&&typeof shape.collapsed!=='boolean')throw Error('Некорректное состояние комментария.');
}
