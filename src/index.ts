import * as cbor from 'cbor';
import * as crypto from 'crypto';
import * as multibase from 'multibase';
import { BaseNameOrCode } from 'multibase';

export let ChunkSize = 2048 * 1024; // 2 megabytes

export enum LeafType {
    FileLeaf = "file",
    ChunkLeaf = "chunk",
    DirectoryLeaf = "directory"
}

export interface DagBuilder {
    Leafs: Record<string, DagLeaf>;
}

export interface DagLeafBuilder {
    Name: string;
    Label: number;
    LeafType: LeafType;
    Data: Uint8Array;
    Links: Record<string, string>;
}

export interface Dag {
    Root: string;
    Leafs: Record<string, DagLeaf>;

    getDataFromLeaf(leaf: DagLeaf): [Uint8Array, any];
    verify(encoder: BaseNameOrCode): Promise<[boolean, any]>;
}

export interface DagLeaf {
    Hash: string;
    Name: string;
    Type: LeafType;
    Data: Uint8Array;
    MerkleRoot: Uint8Array;
    CurrentLinkCount: number;
    LatestLabel: string;
    LeafCount: number;
    Links: Record<string, string>;
    ParentHash: string;

    hasLink(hash: string): boolean;
    addLink(hash: string): void;
    clone(): DagLeaf;
    setLabel(label: string): void;
    verifyLeaf(encoder: BaseNameOrCode): Promise<[boolean, any]>
    verifyRootLeaf(encoder: BaseNameOrCode): Promise<[boolean, any]>
}

export function setChunkSize(size: number) {
    ChunkSize = size;
}

export function CreateDagLeafBuilder(name: string): DagLeafBuilder {
    return new DagLeafBuilder(name);
}

export function hasLabel(hash: string): boolean {
    return getLabel(hash) !== "";
}

export function getHash(hash: string): string {
    const parts = hash.split(":");
    if (parts.length !== 2) return hash;
    return parts[1];
}

export function getLabel(hash: string): string {
    const parts = hash.split(":");
    if (parts.length !== 2) return "";
    return parts[0];
}

export class DagLeafBuilder {
    Name: string;
    Label!: number;
    LeafType!: LeafType;
    Data!: Uint8Array;
    Links: Record<string, string> = {};

    constructor(name: string) {
        this.Name = name;
    }

    setType(leafType: LeafType): void {
        this.LeafType = leafType;
    }

    setData(data: Uint8Array): void {
        this.Data = data;
    }

    addLink(label: string, hash: string): void {
        this.Links[label] = `${label}:${hash}`;
    }
}

export class DagLeaf implements DagLeaf {
    Hash!: string;
    Name!: string;
    Type!: LeafType;
    Data!: Uint8Array;
    MerkleRoot!: Uint8Array;
    CurrentLinkCount!: number;
    LatestLabel!: string;
    LeafCount!: number;
    Links!: Record<string, string>;
    ParentHash!: string;

    constructor(leaf: DagLeaf) {
        Object.assign(this, leaf);
    }

    hasLink(hash: string): boolean {
        for (const label of Object.keys(this.Links)) {
            const link = this.Links[label]

            if (hasLabel(hash)) {
                if (hasLabel(link)) {
                    if (link === hash) return true;
                } else {
                    if (link === getHash(hash)) return true;
                }
            } else {
                if (hasLabel(link)) {
                    if (getHash(link) === hash) return true;
                } else {
                    if (getHash(link) === getHash(hash)) return true;
                }
            }
        }

        return false;
    }

    addLink(hash: string): void {
        const label = getLabel(hash);

        if (label === "") {
            console.log("This hash does not have a label");
        }

        this.Links[label] = hash;
    }

    clone(): DagLeaf {
        return new DagLeaf(this);
    }

    setLabel(label: string): void {
        this.Hash = `${label}:${this.Hash}`;
    }

    async verifyLeaf(encoder: BaseNameOrCode): Promise<[boolean, any]> {
        const leafData = {
            Name: this.Name,
            Type: this.Type,
            MerkleRoot: this.MerkleRoot,
            CurrentLinkCount: this.CurrentLinkCount,
            Data: this.Data,
        };

        try {
            const serializedLeafData = cbor.encode(leafData);
            const hash = crypto.createHash('sha256').update(serializedLeafData).digest();

            let result = false;
            if (hasLabel(this.Hash)) { 
                result = multibase.encode(encoder, hash).toString() === getHash(this.Hash);
            } else {
                result = multibase.encode(encoder, hash).toString() === this.Hash;
            }

            return [result, null];
        } catch (err) {
            return [false, err];
        }
    }

    async verifyRootLeaf(encoder: BaseNameOrCode): Promise<[boolean, any]> {
        const leafData = {
            Name: this.Name,
            Type: this.Type,
            MerkleRoot: this.MerkleRoot,
            CurrentLinkCount: this.CurrentLinkCount,
            LatestLabel: this.LatestLabel,
            LeafCount: this.LeafCount,
            Data: this.Data,
        };

        try {
            const serializedLeafData = cbor.encode(leafData);
            const hash = crypto.createHash('sha256').update(serializedLeafData).digest();

            let result = false;
            if (hasLabel(this.Hash)) {
                result = multibase.encode(encoder, hash).toString() === getHash(this.Hash);
            } else {
                result = multibase.encode(encoder, hash).toString() === this.Hash;
            }

            return [result, null];
        } catch (err) {
            return [false, err];
        }
    }
}

export class DagBuilder {
    Leafs: Record<string, DagLeaf> = {};

    static CreateDagBuilder(): DagBuilder {
        return new DagBuilder();
    }

    getLatestLabel(): string {
        let latestLabel: number = 1;

        for (const hash in this.Leafs) {
            const label = getLabel(hash);

            if (label === "") {
                console.log("Failed to find label in hash");
            }

            const parsed = parseInt(label, 10);

            if (parsed > latestLabel) {
                latestLabel = parsed;
            }
        }

        return latestLabel.toString();
    }

    getNextAvailableLabel(): string {
        const latestLabel = this.getLatestLabel();
        const number = parseInt(latestLabel, 10);

        const nextLabel = (number + 1).toString();

        return nextLabel;
    }

    addLeaf(leaf: DagLeaf, parentLeaf: DagLeaf | null): void {
        if (parentLeaf !== null) {
            const label = getLabel(leaf.Hash);
            if (!(label in parentLeaf.Links)) {
                parentLeaf.addLink(leaf.Hash);
            }
        }

        this.Leafs[leaf.Hash] = leaf;
    }

    buildDag(root: string): Dag {
        return new Dag(this.Leafs, root);
    }
}

export class Dag implements Dag {
    Leafs: Record<string, DagLeaf> = {};
    Root: string;

    constructor(leafs: Record<string, DagLeaf>, root: string) {
        this.Leafs = leafs;
        this.Root = root;
    }

    async verify(encoder: any): Promise<[boolean, any]> {
        let result = true;

        for (const leafHash in this.Leafs) {
            const leaf = this.Leafs[leafHash];
            let leafResult: boolean, err: Error | null;
            if (leaf.Hash === this.Root) {
                [leafResult, err] = await leaf.verifyRootLeaf(encoder);  // Assuming you have a method verifyRootLeaf in DagLeaf class
            } else {
                [leafResult, err] = await leaf.verifyLeaf(encoder);  // Assuming you have a method verifyLeaf in DagLeaf class
            }

            if (err) {
                return [false, err];
            }

            if (!leafResult) {
                result = false;
            }
        }

        return [result, null];
    }

    getDataFromLeaf(leaf: DagLeaf): [Uint8Array, any] {
        if (leaf.Data.length <= 0) {
            return [new Uint8Array(0), null];
        }

        let content = new Uint8Array(0);

        if (Object.keys(leaf.Links).length > 0) {
            for (const label of Object.keys(leaf.Links)) {
                const linkHash = leaf.Links[label]
                const childLeaf = this.Leafs[linkHash];
                if (!childLeaf) {
                    return [new Uint8Array(0), new Error(`Invalid link: ${linkHash}`)];
                }

                content = new Uint8Array([...content, ...childLeaf.Data]);  // Assuming Data is Uint8Array or similar
            }
        } else {
            content = leaf.Data;
        }

        return [content, null];
    }
}