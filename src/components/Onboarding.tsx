import {useEffect,useState} from 'react';
import {lessons,type LessonId,type Lesson} from '../onboarding/scenarios.ts';

export function TrainingHub({onStart,onBack,busy,error}:{onStart:(id:LessonId)=>void;onBack:()=>void;busy:boolean;error:string}){
 return <main className="training-hub">
  <header><strong>ViGC</strong><span>Обучение</span></header>
  <button className="home-back" onClick={onBack}>← Назад</button>
  <h1>Что хочешь собрать?</h1>
  <p>Выбери любой кейс. Приложение покажет модель шаг за шагом.</p>
  <div className="training-cases">{lessons.map((lesson,index)=><article className="training-case" key={lesson.id}>
   <span className="training-case-kind">{['МЕХАНИКА','СИСТЕМА','БАЛАНС'][index]}</span>
   <div className={`training-case-art ${lesson.id}`} aria-hidden="true">
    {lesson.id==='detection'?<><i/><i/><b/></>:lesson.id==='combat'?<><i>Удар</i><b>→</b><i>Реакция</i></>:<><i>2</i><i>3</i><i>5</i></>}
   </div>
   <h2>{lesson.name}</h2><p>{lesson.summary}</p><small>{lesson.outcome}</small>
   <button className="training-case-start" disabled={busy} onClick={()=>onStart(lesson.id)}>{busy?'Открываю…':'Начать кейс →'}</button>
  </article>)}</div>
  {error&&<p className="training-hub-error" role="alert">{error}</p>}
  <p className="training-hub-note">Из кейса можно выйти в любой момент. При возвращении он начнётся с нуля. Учебная Google-таблица сохраняется для следующих кейсов.</p>
 </main>;
}

function targetName(step:Lesson['steps'][number]){
 if(step.focus==='sidebar'&&step.tab)return `вкладка «${({layers:'Фигуры',entities:'Сущности',events:'События'})[step.tab]}» в дереве модели`;
 return ({workspace:'рабочая область',scene:'холст',sidebar:'дерево модели',graph:'схема',timeline:'проигрывание',menu:'результат обучения'})[step.focus];
}

export function TutorialOverlay({lesson,stepIndex,busy,error,workbook,yaml,onNext,onExit,onSwitch,onExport,onResetWorkbook}:{lesson:Lesson;stepIndex:number;busy:boolean;error:string;workbook:{id:string;name:string}|null;yaml:string;onNext:()=>void;onExit:()=>void;onSwitch:()=>void;onExport:()=>void;onResetWorkbook:()=>void}){
 const step=lesson.steps[stepIndex];
 const [focusRect,setFocusRect]=useState<{x:number;y:number;width:number;height:number}|null>(null);
 useEffect(()=>{
  let observer:ResizeObserver|undefined;
  let frame=0;
  const update=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const target=window.document.querySelector<HTMLElement>(`[data-onboarding-focus="${step.focus}"]`);if(!target){setFocusRect(null);return;}const box=target.getBoundingClientRect();const inset=step.focus==='sidebar'||step.focus==='scene'||step.focus==='graph'?6:2;const x=Math.max(0,Math.min(window.innerWidth,box.left-inset)),y=Math.max(0,Math.min(window.innerHeight,box.top-inset)),right=Math.max(x,Math.min(window.innerWidth,box.right+inset)),bottom=Math.max(y,Math.min(window.innerHeight,box.bottom+inset));const next={x,y,width:right-x,height:bottom-y};setFocusRect(previous=>previous&&previous.x===next.x&&previous.y===next.y&&previous.width===next.width&&previous.height===next.height?previous:next);});};
  const target=window.document.querySelector<HTMLElement>(`[data-onboarding-focus="${step.focus}"]`);if(target){observer=new ResizeObserver(update);observer.observe(target);}update();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);return()=>{cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
 },[step.focus]);
 const path=focusRect?`M0 0H100V100H0Z M${focusRect.x/window.innerWidth*100} ${focusRect.y/window.innerHeight*100} H${(focusRect.x+focusRect.width)/window.innerWidth*100} V${(focusRect.y+focusRect.height)/window.innerHeight*100} H${focusRect.x/window.innerWidth*100} Z`:'M0 0H100V100H0Z';
 return <div className="tutorial-layer">
  <div className="tutorial-mask" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d={path} fillRule="evenodd"/></svg></div>{focusRect&&<div className="tutorial-focus-ring" style={{left:focusRect.x,top:focusRect.y,width:focusRect.width,height:focusRect.height}} aria-hidden="true"/>}
  <header className="tutorial-bar"><div><small>ОБУЧЕНИЕ · {lesson.name.toLocaleUpperCase('ru')}</small><strong>{lesson.name}　/　{step.title}</strong></div><span className="tutorial-bar-spacer"/><button onClick={onSwitch}>Другой кейс</button><button onClick={onExit}>Выйти из кейса</button></header>
  <aside className="tutorial-card" role="region" aria-label="Шаг обучения"><small>ВОПРОС ДИЗАЙНЕРА · ШАГ {stepIndex+1} ИЗ {lesson.steps.length}</small><h2>{step.question}</h2><p className="tutorial-answer">{step.answer}</p><p>{step.detail}</p><span className="tutorial-focus">Сейчас: {targetName(step)}</span>{step.yaml&&<><button className="tutorial-export" onClick={onExport}>Скачать YAML схемы</button>{yaml&&<details className="tutorial-yaml"><summary>Посмотреть экспортируемую схему</summary><pre>{yaml}</pre></details>}</>}{workbook&&<a className="tutorial-workbook" href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(workbook.id)}/edit`} target="_blank" rel="noreferrer">Открыть «{workbook.name}» в Google Sheets ↗</a>}{error&&<div className="tutorial-error" role="alert">{error}{/account|permission|доступ|доступа|403|404|листа/i.test(error)&&<button onClick={onResetWorkbook}>Создать новую учебную таблицу</button>}</div>}{busy&&<p role="status">Выполняю шаг…</p>}<button className="tutorial-next" disabled={busy} onClick={onNext}>{stepIndex===lesson.steps.length-1?'Завершить кейс':'Далее →'}</button></aside>
 </div>;
}
