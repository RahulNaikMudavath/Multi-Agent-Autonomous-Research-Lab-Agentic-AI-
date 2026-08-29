import React, { useEffect } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Workflow, 
  Search, 
  PenTool, 
  ShieldCheck, 
  Eye, 
  CheckSquare
} from 'lucide-react';

// Custom Agent Node Component
const AgentNode = ({ data }) => {
  const { label, status, subtext } = data;
  
  const getIcon = () => {
    switch (label) {
      case 'Coordinator': return <Workflow size={16} />;
      case 'Researcher': return <Search size={16} />;
      case 'Writer': return <PenTool size={16} />;
      case 'Fact-Checker': return <ShieldCheck size={16} />;
      case 'Critic': return <Eye size={16} />;
      default: return <CheckSquare size={16} />;
    }
  };

  return (
    <div className={`custom-node ${status}`}>
      <Handle type="target" position={Position.Left} style={{ borderRadius: 0 }} />
      <div className="node-header">
        {getIcon()}
        <span>{label}</span>
      </div>
      <div className="node-status">{subtext || status}</div>
      <Handle type="source" position={Position.Right} style={{ borderRadius: 0 }} />
    </div>
  );
};

const nodeTypes = {
  agentNode: AgentNode,
};

export default function AgentGraph({ activeAgent, logs }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Check if an agent has executed in the past based on logs
  const checkHasRun = (agentName) => {
    return logs.some(log => log.agent.toLowerCase() === agentName.toLowerCase() && log.status === 'completed');
  };

  const getAgentStatus = (agentName) => {
    if (activeAgent === agentName) return 'running';
    if (checkHasRun(agentName)) return 'completed';
    return 'idle';
  };

  useEffect(() => {
    // Determine status of each node
    const coordinatorStatus = getAgentStatus('Coordinator');
    const researcherStatus = getAgentStatus('Researcher');
    const writerStatus = getAgentStatus('Writer');
    const factCheckerStatus = getAgentStatus('Fact-Checker');
    const criticStatus = getAgentStatus('Critic');
    const finalizeStatus = activeAgent === 'Finalize' ? 'completed' : 'idle';

    // 1. Define nodes layout
    const initialNodes = [
      {
        id: 'coordinator',
        type: 'agentNode',
        data: { label: 'Coordinator', status: coordinatorStatus, subtext: coordinatorStatus === 'running' ? 'Planning...' : coordinatorStatus },
        position: { x: 40, y: 150 },
      },
      {
        id: 'researcher',
        type: 'agentNode',
        data: { label: 'Researcher', status: researcherStatus, subtext: researcherStatus === 'running' ? 'Scraping...' : researcherStatus },
        position: { x: 260, y: 30 },
      },
      {
        id: 'fact_checker',
        type: 'agentNode',
        data: { label: 'Fact-Checker', status: factCheckerStatus, subtext: factCheckerStatus === 'running' ? 'Verifying...' : factCheckerStatus },
        position: { x: 260, y: 270 },
      },
      {
        id: 'writer',
        type: 'agentNode',
        data: { label: 'Writer', status: writerStatus, subtext: writerStatus === 'running' ? 'Drafting...' : writerStatus },
        position: { x: 480, y: 150 },
      },
      {
        id: 'critic',
        type: 'agentNode',
        data: { label: 'Critic', status: criticStatus, subtext: criticStatus === 'running' ? 'Reviewing...' : criticStatus },
        position: { x: 700, y: 150 },
      },
      {
        id: 'finalize',
        type: 'agentNode',
        data: { label: 'Final Report', status: finalizeStatus, subtext: finalizeStatus === 'completed' ? 'Published' : 'Idle' },
        position: { x: 920, y: 150 },
      },
    ];

    // 2. Define edges and activate animations based on data flow
    const initialEdges = [
      {
        id: 'e-coord-researcher',
        source: 'coordinator',
        target: 'researcher',
        animated: activeAgent === 'Researcher',
        style: { stroke: activeAgent === 'Researcher' ? '#00f0ff' : 'rgba(255,255,255,0.1)' },
        markerEnd: { type: MarkerType.ArrowClosed, color: activeAgent === 'Researcher' ? '#00f0ff' : '#64748b' }
      },
      {
        id: 'e-researcher-writer',
        source: 'researcher',
        target: 'writer',
        animated: activeAgent === 'Writer' && researcherStatus === 'completed',
        style: { stroke: (activeAgent === 'Writer' && researcherStatus === 'completed') ? '#00f0ff' : 'rgba(255,255,255,0.1)' },
        markerEnd: { type: MarkerType.ArrowClosed, color: (activeAgent === 'Writer' && researcherStatus === 'completed') ? '#00f0ff' : '#64748b' }
      },
      {
        id: 'e-writer-fc',
        source: 'writer',
        target: 'fact_checker',
        animated: activeAgent === 'Fact-Checker',
        style: { stroke: activeAgent === 'Fact-Checker' ? '#00f0ff' : 'rgba(255,255,255,0.1)' },
        markerEnd: { type: MarkerType.ArrowClosed, color: activeAgent === 'Fact-Checker' ? '#00f0ff' : '#64748b' }
      },
      {
        id: 'e-fc-writer',
        source: 'fact_checker',
        target: 'writer',
        // Animated if Fact-Checker flagged error and routed back to Writer
        animated: activeAgent === 'Writer' && logs.some(l => l.agent === 'Fact-Checker' && l.message.includes('back to Writer')),
        style: { 
          stroke: (activeAgent === 'Writer' && logs.some(l => l.agent === 'Fact-Checker' && l.message.includes('back to Writer'))) ? '#ef4444' : 'rgba(255,255,255,0.1)',
          strokeDasharray: '5,5' 
        },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: (activeAgent === 'Writer' && logs.some(l => l.agent === 'Fact-Checker' && l.message.includes('back to Writer'))) ? '#ef4444' : '#64748b' 
        }
      },
      {
        id: 'e-fc-critic',
        source: 'fact_checker',
        target: 'critic',
        animated: activeAgent === 'Critic',
        style: { stroke: activeAgent === 'Critic' ? '#00f0ff' : 'rgba(255,255,255,0.1)' },
        markerEnd: { type: MarkerType.ArrowClosed, color: activeAgent === 'Critic' ? '#00f0ff' : '#64748b' }
      },
      {
        id: 'e-critic-writer',
        source: 'critic',
        target: 'writer',
        // Animated if Critic rejected and routed back to Writer
        animated: activeAgent === 'Writer' && logs.some(l => l.agent === 'Critic' && l.message.includes('back to Writer')),
        style: { 
          stroke: (activeAgent === 'Writer' && logs.some(l => l.agent === 'Critic' && l.message.includes('back to Writer'))) ? '#ef4444' : 'rgba(255,255,255,0.1)',
          strokeDasharray: '5,5' 
        },
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          color: (activeAgent === 'Writer' && logs.some(l => l.agent === 'Critic' && l.message.includes('back to Writer'))) ? '#ef4444' : '#64748b' 
        }
      },
      {
        id: 'e-critic-finalize',
        source: 'critic',
        target: 'finalize',
        animated: activeAgent === 'Finalize',
        style: { stroke: activeAgent === 'Finalize' ? '#10b981' : 'rgba(255,255,255,0.1)' },
        markerEnd: { type: MarkerType.ArrowClosed, color: activeAgent === 'Finalize' ? '#10b981' : '#64748b' }
      }
    ];

    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [activeAgent, logs]);

  return (
    <div className="flow-container">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.5}
        maxZoom={1.5}
        nodesConnectable={false}
        nodesDraggable={true}
        zoomOnScroll={false}
        panOnDrag={true}
      >
        <Controls showInteractive={false} position="bottom-right" />
        <Background color="rgba(255,255,255,0.05)" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
