export var ChunkSize: number = 2048 * 1024;

export type LeafType = "file" | "chunk" | "directory";

export interface Dag {
  Root: string;
  Leafs: { [key: string]: DagLeaf };
}

export interface DagBuilder {
  Leafs: { [key: string]: DagLeaf };
}

export interface DagLeaf {
  Hash: string;
  Name: string;
  Type: LeafType;
  Data: Uint8Array;
  MerkleRoot: Uint8Array;
  CurrentLinkCount: number;
  LatestLabel: string | undefined;
  LeafCount: number | undefined;
  Links: { [key: string]: string };
  ParentHash: string | undefined;
}

export interface DagLeafBuilder {
  Name: string;
  Label: number;
  LeafType: LeafType;
  Data: Uint8Array;
  Links: { [key: string]: string };
}

export interface MetaData {
  Deleted: string[];
}

export function SetChunkSize(size: number): void {
  ChunkSize = size;
}