import { CheckCircle2, CloudUpload, FileSpreadsheet, Info, Play, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { PageTitle } from "../components/UI";

const fileSize = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export default function Upload({ notify }: { notify: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const busy = startedAt !== null;
  const done = progress === 100;

  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => {
      const percentage = Math.min(100, Math.floor((performance.now() - startedAt) / 14));
      setProgress(percentage);
      if (percentage === 100) {
        window.clearInterval(timer);
        setStartedAt(null);
        notify("Демонстрационные результаты готовы.");
      }
    }, 70);
    return () => window.clearInterval(timer);
  }, [startedAt, notify]);

  function selectFile(files: FileList | null) {
    if (!files?.length || busy) return;
    const selected = files.item(0);
    if (files.length !== 1 || !selected || !selected.name.toLowerCase().endsWith(".csv")) {
      setError("Выберите один файл с расширением .csv.");
      return;
    }
    if (!selected.size) {
      setError("Файл пуст. Выберите CSV с данными.");
      return;
    }
    setError("");
    setFile(selected);
    setProgress(0);
  }

  function removeFile() {
    setFile(null);
    setError("");
    setProgress(0);
  }

  return (
    <>
      <PageTitle title="Загрузка CSV" description="Выберите файл, чтобы пройти демонстрационный сценарий расследования." />
      <div className="upload-grid">
        <section className="card upload-card" aria-labelledby="upload-title">
          <div className="card-heading"><h2 id="upload-title">Файл транзакций</h2></div>
          <input hidden ref={input} type="file" accept=".csv,text/csv" disabled={busy}
            onChange={(event) => {
              selectFile(event.currentTarget.files);
              event.currentTarget.value = "";
            }} />
          <div className={`drop-zone${dragging ? " dragging" : ""}`}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = busy ? "none" : "copy";
              if (!busy) setDragging(true);
            }}
            onDragLeave={(event) => {
              if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              selectFile(event.dataTransfer.files);
            }}>
            <span className="upload-icon"><CloudUpload size={28} /></span>
            <h3>Перетащите CSV сюда</h3>
            <p>или выберите один файл на компьютере</p>
            <button className="button secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>
              Выбрать CSV
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <AnimatePresence initial={false}>
            {file && (
              <motion.div className="selected-file" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <span className="panel-icon">{done ? <CheckCircle2 size={20} /> : <FileSpreadsheet size={20} />}</span>
                <div><strong>{file.name}</strong><small>{fileSize.format(file.size / 1024)} КБ{done && " · Демонстрация готова"}</small></div>
                <button type="button" className="icon-button" aria-label="Удалить выбранный файл" onClick={removeFile} disabled={busy}><X size={18} /></button>
              </motion.div>
            )}
          </AnimatePresence>
          {(busy || done) && (
            <div className="upload-progress">
              <div><span>{done ? "Готово к просмотру" : "Подготовка деморезультатов"}</span><strong>{progress}%</strong></div>
              <div className="progress-track" role="progressbar" aria-label="Подготовка деморезультатов" aria-valuenow={progress}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.18 }} />
              </div>
            </div>
          )}
          <div className="form-actions">
            {done && file ? (
              <Link className="button primary" to="/investigations" state={{ fileName: file.name }}><CheckCircle2 size={17} /> Посмотреть результаты</Link>
            ) : (
              <button className="button primary" type="button" disabled={!file || busy} onClick={() => setStartedAt(performance.now())}>
                <Play size={17} /> {busy ? "Подготовка…" : "Запустить демонстрацию"}
              </button>
            )}
          </div>
        </section>
        <aside className="card guidance-card" aria-labelledby="guidance-title">
          <span className="panel-icon"><Info size={20} /></span>
          <h2 id="guidance-title">Локальный сценарий</h2>
          <p>CSV остаётся в браузере. Для просмотра результатов используется готовый набор вымышленных операций.</p>
          <p className="muted">Формат файла — .csv. Достаточно любого непустого тестового CSV.</p>
        </aside>
      </div>
    </>
  );
}
