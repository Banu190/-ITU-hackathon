import { useMemo, useState } from "react";
import {
  Background,
  BaseEdge,
  Controls,
  getSmoothStepPath,
  MarkerType,
  Position,
  ReactFlow,
} from "@xyflow/react";
import type { Edge, EdgeProps, EdgeTypes, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { formatAmount } from "./api";
import type { Transfer } from "./api";

type ReplayEdgeData = {
  particleColor: string;
  showParticle: boolean;
};

type ReplayEdge = Edge<ReplayEdgeData>;

// Кастомная связь: стандартная стрелка React Flow + движущаяся точка.
function TransferParticleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  interactionWidth,
  data,
}: EdgeProps<ReplayEdge>) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 12,
  });

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={style}
        interactionWidth={interactionWidth}
      />

      {data?.showParticle && !reduceMotion && (
        <>
          <circle r="7" fill={data.particleColor} opacity="0.18">
            <animateMotion
              path={edgePath}
              dur="1.5s"
              repeatCount="indefinite"
              rotate="auto"
            />
          </circle>
          <circle r="3.8" fill={data.particleColor}>
            <animateMotion
              path={edgePath}
              dur="1.5s"
              repeatCount="indefinite"
              rotate="auto"
            />
          </circle>
        </>
      )}
    </>
  );
}

const edgeTypes = {
  replay: TransferParticleEdge,
} satisfies EdgeTypes;

type AccountStats = {
  incoming: number;
  outgoing: number;
  incomingAmount: number;
  outgoingAmount: number;
  suspicious: boolean;
};

// Расположение счетов по уровням движения средств.
function layout(transactions: Transfer[]): Node[] {
  const accountOrder: string[] = [];
  const knownAccounts = new Set<string>();
  const adjacency = new Map<string, string[]>();
  const incoming = new Map<string, number>();

  const addAccount = (id: string) => {
    if (!knownAccounts.has(id)) {
      knownAccounts.add(id);
      accountOrder.push(id);
      adjacency.set(id, []);
      incoming.set(id, 0);
    }
  };

  for (const tx of transactions) {
    addAccount(tx.sender);
    addAccount(tx.receiver);
    adjacency.get(tx.sender)?.push(tx.receiver);
    incoming.set(tx.receiver, (incoming.get(tx.receiver) ?? 0) + 1);
  }

  const depth = new Map<string, number>();

  const placeFrom = (starts: string[], startDepth: number) => {
    const queue = [...starts];

    for (const start of starts) {
      depth.set(start, startDepth);
    }

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      const nextDepth = (depth.get(current) ?? startDepth) + 1;

      for (const target of adjacency.get(current) ?? []) {
        if (!depth.has(target)) {
          depth.set(target, nextDepth);
          queue.push(target);
        }
      }
    }
  };

  const roots = accountOrder.filter((id) => (incoming.get(id) ?? 0) === 0);

  if (roots.length) {
    placeFrom(roots, 0);
  }

  let fallbackDepth = depth.size
    ? Math.max(...depth.values()) + 1
    : 0;

  for (const id of accountOrder) {
    if (!depth.has(id)) {
      placeFrom([id], fallbackDepth);
      fallbackDepth = Math.max(...depth.values()) + 1;
    }
  }

  const rowsByColumn = new Map<number, number>();

  return accountOrder.map((id): Node => {
    const column = depth.get(id) ?? 0;
    const row = rowsByColumn.get(column) ?? 0;
    rowsByColumn.set(column, row + 1);

    return {
      id,
      position: {
        x: column * 280,
        y: row * 132,
      },
      data: { label: id },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      width: 184,
    };
  });
}

// Группировка переводов между одинаковыми счетами.
function groupEdges(transactions: Transfer[]) {
  const groups = new Map<string, Transfer[]>();

  for (const tx of transactions) {
    const id = JSON.stringify([tx.sender, tx.receiver]);
    const group = groups.get(id) ?? [];

    group.push(tx);
    groups.set(id, group);
  }

  return groups;
}

// Статистика банковских счетов.
function accountStatistics(transactions: Transfer[]) {
  const stats = new Map<string, AccountStats>();

  const get = (id: string) => {
    const current = stats.get(id) ?? {
      incoming: 0,
      outgoing: 0,
      incomingAmount: 0,
      outgoingAmount: 0,
      suspicious: false,
    };

    stats.set(id, current);
    return current;
  };

  for (const tx of transactions) {
    const sender = get(tx.sender);

    sender.outgoing += 1;
    sender.outgoingAmount += tx.amount_tiyn;
    sender.suspicious ||= tx.risk_level === "high";

    const receiver = get(tx.receiver);

    receiver.incoming += 1;
    receiver.incomingAmount += tx.amount_tiyn;
    receiver.suspicious ||= tx.risk_level === "high";
  }

  return stats;
}

type GraphProps = {
  transactions: Transfer[];
  visibleCount?: number;
  selectedId?: string;
  affected?: ReadonlySet<string>;
  blockedId?: string;
  onSelect: (id: string) => void;
};

export default function TransferGraph({
  transactions,
  visibleCount = transactions.length,
  selectedId,
  affected,
  blockedId,
  onSelect,
}: GraphProps) {
  const [account, setAccount] = useState("");

  const visible = useMemo(
    () =>
      transactions.slice(
        0,
        Math.max(0, Math.min(visibleCount, transactions.length))
      ),
    [transactions, visibleCount]
  );

  // Все транзакции участвуют в расчёте позиций, чтобы узлы не прыгали.
  const positions = useMemo(
    () => layout(transactions),
    [transactions]
  );

  const groups = useMemo(
    () => groupEdges(visible),
    [visible]
  );

  const stats = useMemo(
    () => accountStatistics(visible),
    [visible]
  );

  const firstSender = transactions[0]?.sender;

  const selected = visible.find(
    (tx) => tx.transaction_id === selectedId
  );

  const nodes = useMemo(() => {
    return positions.map((node) => {
      const accountStats = stats.get(node.id);

      let role = "account-normal";

      if (accountStats?.suspicious) {
        role = "account-suspicious";
      } else if (
        accountStats &&
        accountStats.incoming > 0 &&
        accountStats.outgoing > 0
      ) {
        role = "account-intermediary";
      } else if (node.id === firstSender) {
        role = "account-client";
      }

      const highlighted =
        selected?.sender === node.id ||
        selected?.receiver === node.id ||
        account === node.id;

      return {
        ...node,
        className: [
          "account-node",
          role,
          !accountStats && "future",
          highlighted && "highlighted",
        ]
          .filter(Boolean)
          .join(" "),
        ariaLabel: `Счёт ${node.id}`,
      };
    });
  }, [positions, stats, firstSender, selected, account]);

  const edges = useMemo(() => {
    return Array.from(groups, ([id, group]): ReplayEdge => {
      const latest = group[group.length - 1];

      const selectedTransfer = group.find(
        (tx) => tx.transaction_id === selectedId
      );

      const displayTransfer = selectedTransfer ?? latest;
      const active = Boolean(selectedTransfer);

      const affectedCount = group.filter(
        (tx) => affected?.has(tx.transaction_id)
      ).length;

      const blockedCount = group.filter(
        (tx) => tx.transaction_id === blockedId
      ).length;

      const isBlocked = blockedCount > 0;

      const hasHighRisk = group.some(
        (tx) => tx.risk_level === "high"
      );

      let color = "var(--graph-edge)";

      if (isBlocked || affectedCount > 0) {
        color = "var(--risk-high)";
      } else if (active) {
        color = "var(--chart-primary)";
      } else if (hasHighRisk) {
        color = "var(--risk-high)";
      }

      const amountLabel = formatAmount(displayTransfer.amount_tiyn);

      const baseLabel =
        group.length === 1
          ? amountLabel
          : `${group.length} перев. · ${amountLabel}`;

      const label = isBlocked
        ? `${baseLabel} · ЗАБЛОКИРОВАНО`
        : affectedCount > 0
          ? `${baseLabel} · затронуто ${affectedCount}`
          : baseLabel;

      return {
        id,
        source: latest.sender,
        target: latest.receiver,
        type: "replay",
        animated: active && !isBlocked,
        data: {
          showParticle: active && !isBlocked,
          particleColor: color,
        },
        zIndex: active || isBlocked ? 2 : 0,
        label,
        ariaLabel: `${latest.sender} → ${latest.receiver} · ${label}`,
        interactionWidth: 24,
        style: {
          stroke: color,
          strokeWidth: isBlocked ? 4 : active ? 3.5 : 2,
          strokeDasharray:
            affectedCount > 0 && !isBlocked ? "6 4" : undefined,
        },
        labelStyle: {
          fill: "var(--text)",
          fontSize: 12,
          fontWeight: active || isBlocked ? 700 : 500,
        },
        labelShowBg: true,
        labelBgStyle: {
          fill: "var(--panel)",
          fillOpacity: 0.95,
        },
        labelBgPadding: [9, 5] as [number, number],
        labelBgBorderRadius: 6,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
      };
    });
  }, [groups, selectedId, affected, blockedId]);

  const accountTransfers = useMemo(
    () =>
      account
        ? visible.filter(
            (tx) => tx.sender === account || tx.receiver === account
          )
        : [],
    [account, visible]
  );

  const selectedAccountStats = account
    ? stats.get(account)
    : undefined;

  return (
    <>
      <div className="graph-legend" aria-label="Обозначения графа">
        <span>
          <i className="legend-dot client" />
          Клиент
        </span>
        <span>
          <i className="legend-dot intermediary" />
          Промежуточный счёт
        </span>
        <span>
          <i className="legend-dot suspicious" />
          Подозрительная связь
        </span>
        {blockedId && (
          <span>
            <i className="legend-dot suspicious" />
            Условно заблокировано
          </span>
        )}
      </div>

      <div
        className="graph-canvas"
        role="region"
        aria-label="Граф связей между счетами"
      >
        <ReactFlow
          edgeTypes={edgeTypes}
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{
            padding: 0.2,
            maxZoom: 1.15,
          }}
          minZoom={0.05}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          zoomOnScroll={false}
          onlyRenderVisibleElements={positions.length > 100}
          onNodeClick={(_, node) => {
            setAccount(node.id === account ? "" : node.id);
          }}
          onEdgeClick={(_, edge) => {
            const group = groups.get(edge.id);

            if (group?.length) {
              const current = group.find(
                (tx) => tx.transaction_id === selectedId
              );

              onSelect(
                current?.transaction_id ??
                  group[group.length - 1].transaction_id
              );
            }
          }}
          onPaneClick={() => setAccount("")}
        >
          <Background gap={18} color="var(--graph-grid)" />
          <Controls
            showInteractive={false}
            aria-label="Масштаб графа"
          />
        </ReactFlow>
      </div>

      {account && (
        <div className="account-selection">
          <div className="section-header compact">
            <div>
              <h3>{account}</h3>
              <p className="muted">
                Входящих: {selectedAccountStats?.incoming ?? 0}
                {" · "}
                Исходящих: {selectedAccountStats?.outgoing ?? 0}
              </p>
            </div>
            <button
              className="text-button"
              onClick={() => setAccount("")}
            >
              Снять выделение
            </button>
          </div>

          {selectedAccountStats && (
            <div className="account-totals">
              <span>
                Получено:{" "}
                <strong>
                  {formatAmount(selectedAccountStats.incomingAmount)}
                </strong>
              </span>
              <span>
                Отправлено:{" "}
                <strong>
                  {formatAmount(selectedAccountStats.outgoingAmount)}
                </strong>
              </span>
            </div>
          )}

          {accountTransfers.length ? (
            <div className="related">
              {accountTransfers.map((tx) => (
                <button
                  className="text-button"
                  key={tx.transaction_id}
                  onClick={() => onSelect(tx.transaction_id)}
                >
                  {tx.transaction_id}
                  {" · "}
                  {formatAmount(tx.amount_tiyn)}
                </button>
              ))}
            </div>
          ) : (
            <p className="muted">
              На текущем шаге операций по этому счёту ещё нет.
            </p>
          )}
        </div>
      )}
    </>
  );
}

