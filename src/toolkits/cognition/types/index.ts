export type CognitionStageId =
  | "intent-analysis"
  | "planning"
  | "tool-execution"
  | "result-assessment"
  | "adaptation"
  | "completion";

export interface CognitionNode {
  id: string;
  title: string;
  stage: CognitionStageId;
  objective: string;
  prompts: string[];
  outputFields: string[];
}

export interface CognitionEdge {
  from: string;
  to: string;
  condition: string;
}

export type CognitionSubAgentTriggerStage = CognitionStageId | "any";

export interface CognitionSubAgentResultPattern {
  expectedFormat: string;
  requiredOutputs: string[];
  successCriteria: string;
  failureSignal: string;
}

export interface CognitionSubAgentPlot {
  id: string;
  name: string;
  enabled: boolean;
  triggerStage: CognitionSubAgentTriggerStage;
  triggerCondition: string;
  target: string;
  directiveTemplate: string;
  contextFields: string[];
  resultPattern: CognitionSubAgentResultPattern;
}

export interface AgentCognitionProfileManifest {
  kind: "v0";
  schema: "agent-cognition-profile";
  metadata: {
    name: string;
    labels: {
      mode: "linear" | "adaptive";
    };
    annotations: {
      description: string;
      owner?: string;
    };
    timestamps: {
      createdAt: string;
      updatedAt: string;
    };
  };
  spec: {
    profileId: string;
    version: string;
    nodes: CognitionNode[];
    edges: CognitionEdge[];
    strictLoop: boolean;
    subAgentPlots: CognitionSubAgentPlot[];
  };
}

export interface CognitionProtocolRenderResult {
  profileId: string;
  profileName: string;
  strictLoop: boolean;
  text: string;
}
