import { useMemo, useState } from "react";
import {
  Background, BaseEdge, Controls, EdgeLabelRenderer, getSmoothStepPath, MarkerType, Position, ReactFlow,
} from "@xyflow/react";
import type { Edge, EdgeProps, Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { formatAmount } from "./api";
import type { Transfer } from "./api";

type TransferEdge = Edge<{ select: () => void }, "transfer">;

function TransferEdgeView({
  id, source, target, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  label, data, markerEnd, style, interactionWidth,
}: EdgeProps<TransferEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });
  const horizontal = Math.abs(sourceY - targetY) < 1;
  const labelPosition = horizontal
    ? `translate(${labelX}px, ${labelY - 8}px) translate(-50%, -100%)`
    : `translate(${labelX + 10}px, ${labelY}px) translateY(-50%)`;

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={interactionWidth} />
      <EdgeLabelRenderer>
        <button
          type="button"
          className="transfer-edge-label nodrag nopan"
          style={{ transform: labelPosition }}
          aria-label={`${source} → ${target} · ${label}`}
          onClick={(event) => {
            event.stopPropagation();
            data?.select();
          }}
        >{label}</button>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { transfer: TransferEdgeView };

function layout(transactions: Transfer[]) {
  const columns = new Map<string, number>();
  const positions = new Map<number, number>();
  for (const tx of transactions) {
    const column = columns.get(tx.sender) ?? 0;
    if (!columns.has(tx.sender)) columns.set(tx.sender, column);
    if (!columns.has(tx.receiver)) columns.set(tx.receiver, Math.min(column + 1, 6));
  }
  return Array.from(columns, ([id, column]): Node => {
    const row = positions.get(column) ?? 0;
    positions.set(column, row + 1);
    return {
      id, position: { x: column * 260, y: row * 104 },
      data: { label: id }, sourcePosition: Position.Right, targetPosition: Position.Left,
      width: 150,
    };
  });
}

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

type GraphProps = {
  transactions: Transfer[];
  visibleCount?: number;
  selectedId?: string;
  affected?: ReadonlySet<string>;
  onSelect: (id: string) => void;
};

export default function TransferGraph({ transactions, visibleCount = transactions.length, selectedId, affected, onSelect }: GraphProps) {
  const [account, setAccount] = useState("");
  const positions = useMemo(() => layout(transactions), [transactions]);
  const visible = transactions.slice(0, visibleCount);
  const groups = groupEdges(visible);
  const accountsWithActivity = new Set(visible.flatMap((tx) => [tx.sender, tx.receiver]));
  const selected = visible.find((tx) => tx.transaction_id === selectedId);
  const nodes = positions.map((node) => ({
    ...node,
    className: [
      "account-node",
      !accountsWithActivity.has(node.id) && "future",
      (selected?.sender === node.id || selected?.receiver === node.id || account === node.id) && "highlighted",
    ].filter(Boolean).join(" "),
    ariaLabel: `Счёт ${node.id}`,
  }));
  const edges = Array.from(groups, ([id, group]): TransferEdge => {
    const latest = group[group.length - 1];
    const active = group.some((tx) => tx.transaction_id === selectedId);
    const blocked = group.filter((tx) => affected?.has(tx.transaction_id)).length;
    const color = blocked ? "#fba268" : active ? "#8ee4ff" : "#668eb7";
    const summary = group.length === 1 ? formatAmount(latest.amount_tiyn) : `Переводов: ${group.length}`;
    const label = blocked ? `${summary} · остановлено ${blocked}` : summary;
    return {
      id, source: latest.sender, target: latest.receiver, type: "transfer",
      zIndex: active ? 1 : 0,
      label, focusable: false,
      data: { select: () => onSelect(latest.transaction_id) },
      ariaLabel: `${latest.sender} → ${latest.receiver} · ${label}`,
      style: { stroke: color, strokeWidth: active ? 3 : 2, strokeDasharray: blocked ? "6 4" : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  });
  const accountTransfers = account
    ? visible.filter((tx) => tx.sender === account || tx.receiver === account)
    : [];

  return (
    <>
      <div className="graph-canvas" role="region" aria-label="Граф связей между счетами">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          edgeTypes={edgeTypes}
          style={{ colorScheme: "dark" }}
          fitView
          fitViewOptions={{ padding: "28px", maxZoom: 1.15 }}
          minZoom={0.05}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          deleteKeyCode={null}
          zoomOnScroll={false}
          onlyRenderVisibleElements={positions.length > 100}
          onNodeClick={(_, node) => setAccount(node.id === account ? "" : node.id)}
          onEdgeClick={(_, edge) => edge.data?.select()}
          onPaneClick={() => setAccount("")}
        >
          <Background gap={18} color="#294057" />
          <Controls showInteractive={false} aria-label="Масштаб графа" />
        </ReactFlow>
      </div>
      {account && (
        <div className="account-selection">
          <div className="section-header compact">
            <h3>{account}</h3>
            <button className="text-button" onClick={() => setAccount("")}>Снять выделение</button>
          </div>
          {accountTransfers.length ? <div className="related">
            {accountTransfers.map((tx) => <button className="text-button" key={tx.transaction_id}
              onClick={() => onSelect(tx.transaction_id)}>{tx.transaction_id}</button>)}
          </div> : <p className="muted">На текущем шаге операций по этому счёту ещё нет.</p>}
        </div>
      )}
    </>
  );
}
