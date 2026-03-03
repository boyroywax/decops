/**
 * MeshConfig types — configuration shape used by the Architect
 * to describe a network deployment before it is materialized.
 * Extracted from types/index.ts for modularity.
 */

export interface MeshConfig {
  networks?: MeshConfigNetwork[];
  agents: MeshConfigAgent[];
  channels: MeshConfigChannel[];
  groups: MeshConfigGroup[];
  bridges?: MeshConfigBridge[];
  exampleMessages: MeshConfigMessage[];
}

export interface MeshConfigNetwork {
  name: string;
  description?: string;
  agents: number[]; // indices into agents array
}

export interface MeshConfigBridge {
  fromNetwork: number; // index into networks array
  toNetwork: number;
  fromAgent: number; // index into agents array
  toAgent: number;
  type: string; // channel type
}

export interface MeshConfigAgent {
  name: string;
  role: string;
  prompt: string;
  network?: number; // index into networks array (alternative to MeshConfigNetwork.agents)
}

export interface MeshConfigChannel {
  from: number;
  to: number;
  type: string;
}

export interface MeshConfigGroup {
  name: string;
  governance: string;
  members: number[];
  threshold: number;
}

export interface MeshConfigMessage {
  channelIdx: number;
  message: string;
}
