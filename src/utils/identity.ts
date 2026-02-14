import type { KeyPair } from "../types";

export function generateDID(): string {
  const chars = "abcdef0123456789";
  const id = Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `did:peer:${id.slice(0, 8)}...${id.slice(-6)}`;
}

export function generateKeyPair(): KeyPair {
  const hex = (n: number) =>
    Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  return { pub: `0x${hex(12)}...`, priv: `••••••${hex(4)}` };
}

export function generateGroupDID(): string {
  const chars = "abcdef0123456789";
  const id = Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `did:group:${id.slice(0, 10)}...${id.slice(-6)}`;
}

export function generateNetworkDID(): string {
  const chars = "abcdef0123456789";
  const id = Array.from({ length: 48 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `did:network:${id.slice(0, 12)}...${id.slice(-6)}`;
}
