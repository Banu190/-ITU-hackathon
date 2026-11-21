import { FolderSearch, Info, Search, UploadCloud } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { CaseTable, PageTitle } from "../components/UI";
import { investigations, risks } from "../data/demo";

export default function Investigations() {
  const [query, setQuery] = useState("");
  const [params, setParams] = useSearchParams();
  const activeRisk = risks.find((item) => item === params.get("risk"));
  const { state } = useLocation();
  const fileName = typeof state?.fileName === "string" ? state.fileName : "";
  const search = query.trim().toLowerCase();
  const matches = investigations.filter((item) =>
    (!activeRisk || item.risk === activeRisk) && (item.id.toLowerCase().includes(search) || item.title.toLowerCase().includes(search)));

  return (
    <>
      <PageTitle title="Расследования" description="Найдите нужный кейс по номеру или уровню риска."
        action={<Link className="button primary" to="/upload"><UploadCloud size={17} /> Загрузить CSV</Link>} />
      {fileName && (
        <div className="notice"><Info size={19} /><p><strong>Демонстрационные результаты для «{fileName}»</strong><br />
          Показан заранее подготовленный набор. Данные из CSV не анализировались.</p></div>
      )}
      <section className="card investigations-card" aria-label="Список расследований">
        <div className="filter-bar">
          <label className="search-field"><Search size={18} /><span className="sr-only">Поиск расследований</span>
            <input type="search" value={query} placeholder="Поиск по номеру или названию" onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="segmented" aria-label="Уровень риска">
            {["Все", ...risks].map((risk) => (
              <button type="button" key={risk} aria-pressed={risk === (activeRisk ?? "Все")}
                onClick={() => setParams(risk === "Все" ? {} : { risk }, { replace: true, state })}>{risk}</button>
            ))}
          </div>
        </div>
        <p className="results-count" aria-live="polite">Показано {matches.length} из {investigations.length}</p>
        {matches.length ? <CaseTable cases={matches} /> : (
          <div className="empty-state"><span className="panel-icon"><FolderSearch size={23} /></span><h2>Кейсы не найдены</h2>
            <p>Измените запрос или снимите фильтр риска.</p>
            <button className="button secondary" type="button" onClick={() => { setQuery(""); setParams({}, { replace: true, state }); }}>Сбросить фильтры</button>
          </div>
        )}
      </section>
    </>
  );
}
