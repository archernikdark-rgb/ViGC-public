import { useRef, useState } from 'react';
import type { SavedProject } from '../persistence/project.ts';
import { isValidImportName, parseProjectFile } from '../persistence/importProject.ts';
import { Icon } from './Icon.tsx';

interface RecentProject { id: string; name: string; updated: number }
interface ImportDraft { project: SavedProject; name: string }

export function ProjectHome({
  projects, busy, engineReady, currentModified, notice, onCreate, onOpen, onImport, onContinue, onTraining,
}: {
  projects: RecentProject[];
  busy: boolean;
  engineReady: boolean;
  currentModified: boolean;
  notice: string;
  onCreate: () => void | Promise<void>;
  onOpen: (id: string) => void;
  onImport: (project: SavedProject, name: string) => Promise<boolean>;
  onContinue: () => void;
  onTraining: () => void;
}) {
  const [importMode, setImportMode] = useState(false);
  const [importDraft, setImportDraft] = useState<ImportDraft | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importError, setImportError] = useState('');
  const importInput = useRef<HTMLInputElement>(null);

  async function chooseFile(file: File | null) {
    if (!file) return;
    setImportMode(true);
    setImportDraft(null);
    setImportFileName(file.name);
    setImportError('');
    try {
      const project = parseProjectFile(await file.text());
      setImportDraft({ project, name: project.document.name });
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Не удалось прочитать файл.');
    }
  }

  function fileInput() {
    return <input
      ref={importInput}
      className="visually-hidden"
      aria-label="Выбрать проектный JSON"
      type="file"
      accept=".json,application/json"
      onChange={event => {
        void chooseFile(event.currentTarget.files?.[0] ?? null);
        event.currentTarget.value = '';
      }}
    />;
  }

  function header() {
    return <header className="project-home-header"><strong className="wordmark">ViGC</strong><span>Мои проекты</span></header>;
  }

  if (importMode) {
    return <main className="project-home">
      {header()}
      {fileInput()}
      <div className="import-page">
        <button className="home-back" onClick={() => { setImportMode(false); setImportDraft(null); setImportError(''); }}>← Назад к проектам</button>
        <h1>Открыть проект из файла</h1>
        <p className="import-subtitle">Проверьте выбранный проект перед созданием копии в этом браузере.</p>
        <div className="import-layout">
          <section className="import-file-panel">
            <h2>Выбранный файл</h2>
            <div className={`import-file-card ${importError ? 'has-error' : ''}`}>
              <span className="import-file-icon"><Icon name="file" size={34}/></span>
              <div>
                <strong>{importFileName}</strong>
                <small>{importDraft ? 'Проект ViGC · JSON' : 'Файл выбран с компьютера'}</small>
                {importError && <p role="alert">{importError}</p>}
              </div>
              {importDraft && <button onClick={() => importInput.current?.click()}>Изменить</button>}
            </div>
            {!importDraft && <button className="home-secondary" onClick={() => importInput.current?.click()}>{importError ? 'Выбрать другой файл' : 'Выбрать файл проекта'}</button>}
            {importDraft ? <>
              <h2 className="import-explainer-title">Что произойдёт</h2>
              <ul className="import-explainer">
                <li>Проект откроется в ViGC как отдельная копия.</li>
                <li>Исходный JSON останется без изменений.</li>
                <li>Копия появится в списке проектов этого браузера.</li>
              </ul>
            </> : <p className="import-unchanged">Ничего не импортировано. Текущие проекты не изменены.</p>}
          </section>
          <aside className="import-settings">
            <h2>Параметры копии</h2>
            <label htmlFor="import-project-name">Название проекта</label>
            <input
              id="import-project-name"
              value={importDraft?.name ?? ''}
              required
              disabled={!importDraft}
              placeholder="Доступно после проверки файла"
              onChange={event => setImportDraft(current => current ? { ...current, name: event.target.value } : current)}
            />
            <label>Хранение</label>
            <div className="import-storage">В этом браузере</div>
            <p>Можно изменить название. Исходный файл и существующие проекты не перезаписываются.</p>
            <button
              className="primary import-open"
              disabled={!importDraft || !isValidImportName(importDraft.name) || !engineReady || busy}
              onClick={() => { if (importDraft) void onImport(importDraft.project, importDraft.name); }}
            >{busy ? 'Открываем…' : 'Открыть копию'}</button>
            <button className="import-cancel" onClick={() => { setImportMode(false); setImportDraft(null); setImportError(''); }}>Отмена</button>
          </aside>
        </div>
        {notice && <p role="alert" className="import-notice">{notice}</p>}
      </div>
    </main>;
  }

  return <main className="project-home">
    {header()}
    {fileInput()}
    <div className="home-shell">
      <section className="home-hero">
        <div>
          <h1>Что будем проектировать?</h1>
          <p>Начните с пустого проекта или продолжите работу с CLI-файлом.</p>
        </div>
      </section>
      <section className="home-start">
        <h2>Начать новый проект</h2>
        <div className="home-card-grid">
          <button className="home-card home-card-primary" disabled={!engineReady || busy} onClick={() => void onCreate()}>
            <span className="home-card-icon"><Icon name="plus" size={46}/></span>
            <strong>Пустой проект</strong>
            <small>Собрать механику с чистого листа</small>
          </button>
          <button className="home-card" disabled={busy} onClick={() => importInput.current?.click()}>
            <span className="home-card-icon file-icon"><Icon name="file" size={42}/></span>
            <strong>Открыть проект из файла</strong>
            <small>Импортировать проектный JSON из CLI</small>
          </button>
          <button className="home-card home-card-training" onClick={onTraining}>
            <span className="home-card-icon training-icon"><Icon name="school" size={34}/></span>
            <strong>Пройти обучение</strong>
            <small>Разобраться в интерфейсе на примере</small>
          </button>
        </div>
        {currentModified && <button className="home-continue" onClick={onContinue}>Продолжить текущую работу</button>}
      </section>
      <section className="home-recent">
        <h2>Недавние проекты</h2>
        {projects.length === 0
          ? <p className="home-empty">Сохранённые проекты появятся здесь.</p>
          : <div className="project-list">{projects.map(project => <button key={project.id} disabled={!engineReady || busy} onClick={() => onOpen(project.id)}>
            <strong>{project.name}</strong>
            <span>{new Date(project.updated).toLocaleString()}</span>
            <span>Открыть →</span>
          </button>)}</div>}
      </section>
    </div>
    {notice && <p role="alert" className="home-notice">{notice}</p>}
  </main>;
}
