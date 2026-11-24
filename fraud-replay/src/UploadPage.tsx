import { ArrowRight, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router";
import csvExample from "../data/demo.csv?url";
import { errorMessage } from "./api";
import type { Dataset } from "./api";
import { linkTo } from "./navigation";
import { PageHeading, PanelHeading } from "./ui";

export default function UploadPage({ onDataset, analyze, exampleUrl = csvExample }: {
  onDataset: (dataset: Dataset) => void;
  analyze: (file: File, signal: AbortSignal, onQueued: () => void) => Promise<Dataset>;
  exampleUrl?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const operation = useRef<AbortController | null>(null);

  useEffect(() => () => operation.current?.abort(), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || operation.current) return;
    const form = event.currentTarget;
    const controller = new AbortController();
    operation.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
    setBusy(true);
    setMessage("Загружаем файл…");
    setError("");
    try {
      const result = await analyze(file, signal, () => setMessage("Анализируем набор…"));
      onDataset(result);
      form.reset();
      setFile(null);
      setMessage(`Анализ завершён. Операций: ${result.transactions.length}. Расследований: ${result.cases.length}.`);
    } catch (failure) {
      if (!controller.signal.aborted) {
        setMessage("");
        setError(signal.aborted ? "Сервер не подтвердил завершение анализа за две минуты." : errorMessage(failure));
      }
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <>
    <PageHeading title="Загрузка CSV" description="Загрузите набор транзакций и запустите проверку на риски." />
    <div className="workspace upload-workspace">
      <section className="panel">
        <PanelHeading title="Импорт транзакций" />
        <form onSubmit={(event) => void submit(event)}>
          <label className="upload-zone">
            <span className="stat-icon stat-low"><FileSpreadsheet size={21} aria-hidden="true" /></span>
            <strong>{file ? file.name : "Выберите файл транзакций"}</strong>
            <span>CSV · UTF-8</span>
            <input type="file" accept=".csv,text/csv" disabled={busy} aria-label="Файл транзакций"
              onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); setError(""); setMessage(""); }} />
          </label>
          <div className="toolbar upload-actions">
            <button type="submit" className="button" disabled={!file || busy}><Upload size={15} />Запустить анализ</button>
          </div>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <div className="upload-result" role="status">
          <span>{message}</span>
          {!busy && <Link className="text-button" to={linkTo("transactions")}>Открыть транзакции <ArrowRight size={15} /></Link>}
        </div>}
      </section>
      <section className="panel">
        <PanelHeading title="Формат файла" />
        <p className="muted">Сумма в тенге или тиынах. Время в ISO 8601 с часовым поясом.</p>
        <p className="code-block">transaction_id, timestamp, sender, receiver, amount</p>
        <a className="button secondary" href={exampleUrl} download="fraud-replay-example.csv"><Download size={15} />Скачать пример</a>
      </section>
    </div>
  </>;
}
