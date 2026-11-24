import { ArrowRight, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { downloadBlob, errorMessage, request } from "./api";
import type { Dataset } from "./api";
import { demoCsv, demoDataset } from "./demo";
import { linkTo } from "./navigation";
import { PageHeading, PanelHeading } from "./ui";

function normalizeCsv(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trimEnd();
}

export default function UploadPage({ demo, onDataset }: { demo: boolean; onDataset: (dataset: Dataset) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function updateDataset(selected: File | null, form?: HTMLFormElement) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      let result: Dataset;
      if (demo) {
        if (selected && (selected.size > 1024 * 1024 || normalizeCsv(await selected.text()) !== demoCsv())) {
          throw new Error("Для демонстрационного анализа используйте файл примера из этой страницы.");
        }
        result = demoDataset;
      } else if (selected) {
        const body = new FormData();
        body.append("file", selected);
        result = await request<Dataset>("/api/datasets/import", { method: "POST", body });
      } else {
        result = await request<Dataset>("/api/datasets/demo", { method: "POST" });
      }
      onDataset(result);
      form?.reset();
      setFile(null);
      setMessage(`${demo ? "Демоанализ завершён" : "Анализ завершён"}. Операций: ${result.transactions.length}. Расследований: ${result.cases.length}.`);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (file) void updateDataset(file, event.currentTarget);
  }

  return <>
    <PageHeading title="Загрузка CSV" description="Загрузите набор транзакций и запустите проверку на риски." />
    <div className="workspace upload-workspace">
      <section className="panel">
        <PanelHeading title="Импорт транзакций" description={demo ? "Деморежим использует готовые результаты для файла примера." : "Используйте только синтетические транзакции."} />
        <form onSubmit={submit}>
          <label className="upload-zone">
            <span className="stat-icon stat-low"><FileSpreadsheet size={21} aria-hidden="true" /></span>
            <strong>{file ? file.name : "Выберите файл транзакций"}</strong>
            <span>CSV · UTF-8 · до 1 МБ</span>
            <input type="file" accept=".csv,text/csv" disabled={busy} aria-label="Файл транзакций"
              onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); setError(""); setMessage(""); }} />
          </label>
          <div className="toolbar upload-actions">
            <button type="submit" className="button" disabled={!file || busy}><Upload size={15} />Запустить анализ</button>
            <button type="button" className="button secondary" disabled={busy}
              onClick={(event) => void updateDataset(null, event.currentTarget.form ?? undefined)}>Загрузить пример</button>
          </div>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
        {(busy || message) && <div className="upload-result" role="status">
          <span>{busy ? "Анализируем набор…" : message}</span>
          {!busy && <a className="text-button" href={linkTo("transactions")}>Открыть транзакции <ArrowRight size={15} /></a>}
        </div>}
      </section>
      <section className="panel">
        <PanelHeading title="Формат файла" />
        <p className="muted">До 1 000 операций. Сумма в тенге, время в ISO 8601 с часовым поясом.</p>
        <p className="code-block">transaction_id, timestamp, sender, receiver, amount</p>
        {demo
          ? <button type="button" className="button secondary" onClick={() => downloadBlob(new Blob([demoCsv()], { type: "text/csv;charset=utf-8" }), "fraud-replay-demo.csv")}><Download size={15} />Скачать пример</button>
          : <a className="button secondary" href="/api/demo.csv" download><Download size={15} />Скачать пример</a>}
      </section>
    </div>
  </>;
}
