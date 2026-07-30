import { useQuery } from '@tanstack/react-query';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect } from 'react';
import { api } from '../../shared/api/client';

export function KnowledgeGraph({ courseId }: { courseId: string }) {
  const q = useQuery({
    queryKey: ['graph', courseId],
    queryFn: () =>
      api<{
        source: string;
        nodes?: Array<{ type: string; id: string; name?: string; title?: string }>;
        edges?: Array<{ from: string; to: string; type: string }>;
        records?: unknown[];
      }>(`/courses/${courseId}/analytics/graph`),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!q.data?.nodes) return;
    const ns: Node[] = q.data.nodes.map((n, i) => ({
      id: n.id,
      position: { x: (i % 5) * 180, y: Math.floor(i / 5) * 100 },
      data: { label: `${n.type}: ${n.name || n.title || n.id.slice(0, 6)}` },
      style: {
        border: '1px solid #dbdbdb',
        borderRadius: 8,
        padding: 8,
        fontSize: 12,
        background: n.type === 'Topic' ? '#f7f0ff' : '#fff',
      },
    }));
    const es: Edge[] = (q.data.edges ?? []).map((e, i) => ({
      id: `e${i}`,
      source: e.from,
      target: e.to,
      label: e.type,
    }));
    setNodes(ns);
    setEdges(es);
  }, [q.data, setNodes, setEdges]);

  return (
    <div style={{ height: 420, border: '1px solid var(--border)', borderRadius: 8 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
