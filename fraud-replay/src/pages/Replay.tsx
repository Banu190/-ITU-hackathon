import { GitFork, Play } from "lucide-react";
import { Link, useParams } from "react-router";
import { PageTitle } from "../components/UI";
import { investigations } from "../data/demo";
import { NotFound } from "./InvestigationDetails";

export default function Replay() {
  const { caseId } = useParams();
  const investigation = investigations.find((item) => item.id === caseId);
  if (caseId && !investigation) return <NotFound />;

  return (
    <>
      <PageTitle title="Fraud Replay"
        description={investigation ? `${investigation.id} · ${investigation.title}` : "Воспроизведение последовательности транзакций."}
        action={<Link className="button secondary" to={investigation ? `/investigations/${investigation.id}` : "/investigations"}>
          {investigation ? "К деталям кейса" : "К расследованиям"}
        </Link>} />
      <section className="card replay-card" aria-labelledby="replay-title">
        <div className="card-heading"><h2 id="replay-title"><GitFork size={19} /> Хронология переводов</h2></div>
        <div className="replay-placeholder">
          <span className="upload-icon"><Play size={27} /></span>
          <h3>Место для визуализации</h3>
          <p>Здесь появится граф связей и пошаговое воспроизведение операций.</p>
        </div>
      </section>
    </>
  );
}
