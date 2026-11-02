import type { LessonId } from './scenarios.ts';
import type { TrainingSheet } from '../google/connection.ts';

export const trainingSheetNames=['Бой — механики','Бой — система','Карты','Баланс','Прогоны'];

const cards=[
 {name:'Искра',color:'Красная',cost:2,hp:4,damage:2,multiplier:1.5},
 {name:'Прилив',color:'Синяя',cost:3,hp:6,damage:4,multiplier:1.5},
 {name:'Уголь',color:'Красная',cost:4,hp:10,damage:6,multiplier:1.5},
 {name:'Глубина',color:'Синяя',cost:5,hp:12,damage:8,multiplier:1.5},
];
type Card=typeof cards[number];
interface Unit {card:Card;hp:number;deployedOn:number;order:number}
interface ActionRow {turn:number;player:string;action:string;target:string;damage:number;board:string;mana:number}

export function hasPlayableCard(costs:number[],maxMana:number){return costs.some(cost=>cost<=maxMana);}

function simulateDuel(redBonusA:number,redBonusB:number,starter:'Игрок A'|'Игрок B'){
 const names=['Игрок A','Игрок B'] as const;
 const players=names.map((name,index)=>({name,bonus:index===0?redBonusA:redBonusB,reserve:cards.map(card=>({...card})),board:[] as Unit[],order:0}));
 const rows:ActionRow[]=[];
 let winner='Ничья';let finishedOn=60;
 for(let turn=1;turn<=60;turn++){
  const playerOrder=turn===1&&starter==='Игрок B'?[1,0]:[0,1];
  for(const playerIndex of playerOrder){
   const player=players[playerIndex]!,opponent=players[1-playerIndex]!;let mana=5;const played:string[]=[];
   while(true){const next=player.reserve.filter(card=>card.cost<=mana).sort((a,b)=>a.cost-b.cost)[0];if(!next)break;player.reserve.splice(player.reserve.indexOf(next),1);mana-=next.cost;player.board.push({card:next,hp:next.hp,deployedOn:turn,order:player.order++});played.push(next.name);}
   const ready=player.board.filter(unit=>unit.deployedOn<turn).sort((a,b)=>a.order-b.order);
   const attacks:string[]=[];
   for(const unit of ready){const target=opponent.board.filter(item=>item.hp>0).sort((a,b)=>a.hp-b.hp||a.order-b.order)[0];if(!target)break;const multiplier=unit.card.color===target.card.color?player.bonus:1;const damage=unit.card.damage*multiplier;target.hp=Math.max(0,target.hp-damage);attacks.push(`${unit.card.name} → ${target.card.name}: ${damage}`);rows.push({turn,player:player.name,action:'Атака',target:`${unit.card.name} → ${target.card.name}`,damage,board:`${player.board.filter(u=>u.hp>0).length} / ${opponent.board.filter(u=>u.hp>0).length}`,mana});}
   player.board=player.board.filter(unit=>unit.hp>0);opponent.board=opponent.board.filter(unit=>unit.hp>0);
   rows.push({turn,player:player.name,action:`Выставлены: ${played.join(', ')||'нет'}${attacks.length?`; ${attacks.join('; ')}`:''}`,target:'',damage:0,board:`${player.board.length} / ${opponent.board.length}`,mana});
   if(opponent.board.length===0&&!hasPlayableCard(opponent.reserve.map(card=>card.cost),5)){winner=player.name;finishedOn=turn;break;}
  }
  if(winner!=='Ничья')break;
 }
 const a=players[0]!,b=players[1]!;
 return {winner,turn:finishedOn,rows,remaining:`A: ${a.board.reduce((sum,u)=>sum+u.hp,0)} HP, резерв ${a.reserve.length}; B: ${b.board.reduce((sum,u)=>sum+u.hp,0)} HP, резерв ${b.reserve.length}`};
}

function cardRows():TrainingSheet['values']{
 return [
  ['Карта','Цвет','Мана','HP','Базовый урон','Множитель своего цвета','Урон по красной','Урон по синей','Урон на ману','HP на ману'],
  ...cards.map((card,index)=>{const row=index+2;return [card.name,card.color,card.cost,card.hp,card.damage,card.multiplier,`=E${row}*IF(B${row}="Красная",F${row},1)`,`=E${row}*IF(B${row}="Синяя",F${row},1)`,`=E${row}/C${row}`,`=D${row}/C${row}`];}),
 ];
}

function balanceRows():TrainingSheet['values']{
 const values:TrainingSheet['values']=[['Атакующая карта','Цель','Цвет атаки','Цвет цели','Урон за атаку','Атак до уничтожения','Урон на ману']];
 for(const attacker of cards)for(const target of cards){const row=values.length+1;values.push([attacker.name,target.name,attacker.color,target.color,`=VLOOKUP(A${row},'Карты'!$A:$J,5,FALSE)*IF(C${row}=D${row},VLOOKUP(A${row},'Карты'!$A:$J,6,FALSE),1)`,`=ROUNDUP(VLOOKUP(B${row},'Карты'!$A:$J,4,FALSE)/E${row},0)`,`=E${row}/VLOOKUP(A${row},'Карты'!$A:$J,3,FALSE)`]);}
 return values;
}

function runRows():TrainingSheet['values']{
 const scenarios=[
  {name:'Зеркальные цвета, множитель 1,5',a:1.5,b:1.5,first:'Игрок A' as const},
  {name:'Без цветового бонуса',a:1,b:1,first:'Игрок A' as const},
  {name:'Бонус 1,5 только у A',a:1.5,b:1,first:'Игрок A' as const},
  {name:'Те же правила, первым ходит B',a:1.5,b:1.5,first:'Игрок B' as const},
 ];
 const values:TrainingSheet['values']=[['Сценарий','Ход','Игрок','Действие','Цель','Урон','Карт на столе A / B','Маны осталось'],['Правила','Оба игрока получают 5 маны в начале хода; сначала выставляют самые дешёвые доступные карты. Новая карта не атакует в ход выставления. Каждая более ранняя карта атакует одну карту с наименьшим оставшимся HP. Урон не переносится на следующую цель. Резерв бесконечно не пополняется. Пустой стол не означает поражение, пока при следующем восстановлении до 5 маны остаётся доступная карта.']];
 for(const scenario of scenarios){const result=simulateDuel(scenario.a,scenario.b,scenario.first);values.push([scenario.name,'РЕЗУЛЬТАТ',result.winner,`Завершение: ход ${result.turn}`,result.remaining,'','','']);for(const row of result.rows)values.push([scenario.name,row.turn,row.player,row.action,row.target,row.damage,row.board,row.mana]);}
 return values;
}

export function buildTrainingSheets(lesson:LessonId):TrainingSheet[]{
 if(lesson==='combat')return [
  {name:'Бой — механики',values:[['Механика','Подготовка / окно (тики по 0,1 с)','Восстановление (тики)','Урон / эффект','Исходные условия'],['Лёгкий удар',4,3,10,'Обе стороны: 100 HP; действие блокируется, пока участник занят'],['Сильный удар',9,6,25,'Сильный удар медленнее, урон выше'],['Уклонение',3,4,'—','Игрок неуязвим 3 тика, затем восстанавливается 4 тика'],['Парирование',2,4,'—','Успех в двух тиках перед попаданием; атакующий оглушён на 8 тиков']]},
  {name:'Бой — система',values:[['Шаг','Правило','Связь с другими механиками'],['Время','Один тик равен 0,1 секунды.','Параметры подготовки и восстановления считают тики.'],['1. Намерение','Игрок или противник выбирает лёгкий или сильный удар.','Параметры подготовки определяют время до попадания.'],['2. Ответ','До попадания можно уклониться или поставить парирование.','Уклонение отменяет попадание на 3 тика; точное парирование оглушает на 8.'],['3. Попадание','Если атака не отменена, цель теряет HP.','Лёгкая атака наносит 10; сильная — 25.'],['4. Восстановление','После удара атакующий восстанавливается.','Лёгкий — 3 тика; сильный — 6.'],['Допущение учебного примера','Урон не зависит от дистанции и брони.','Числа иллюстративные и редактируемые.']]},
  ];
 const cardsSheet={name:'Карты',values:cardRows()};
 if(lesson==='cards')return [cardsSheet,{name:'Баланс',values:balanceRows()},{name:'Прогоны',values:runRows()}];
 return [];
}
