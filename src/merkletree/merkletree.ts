/*
import { createHash } from 'crypto';
import { Pool } from 'gool';

const sha256Digest = createHash('sha256');

interface DataBlock {
    serialize(): Promise<Buffer>;
}

enum TypeConfigMode {
    ModeProofGen,
    ModeTreeBuild,
    ModeProofGenAndTreeBuild,
}

type TypeHashFunc = (data: Buffer) => Promise<Buffer>;

type TypeConcatHashFunc = (b1: Buffer, b2: Buffer) => Buffer;

interface Config {
    hashFunc: TypeHashFunc;
    numRoutines: number;
    mode: TypeConfigMode;
    runInParallel: boolean;
    sortSiblingPairs: boolean;
    disableLeafHashing: boolean;
}

interface Proof {
    siblings: Buffer[];
    path: number;
}

class MerkleTree {
    private config: Config;
    private leafMap: Map<string, number>;
    private leafMapMu: Mutex;
    private wp: Pool<WorkerArgs, Error>;
    private concatHashFunc: TypeConcatHashFunc;
    private nodes: Buffer[][][];
    private root: Buffer;
    private leaves: Buffer[][];
    private proofs: Proof[];
    private depth: number;
    private numLeaves: number;
    private keys: string[];

    constructor(config: Config, blocks: Map<string, DataBlock>) {
        const keys = Array.from(blocks.keys()).sort();
        const sortedBlocks = keys.map((key) => blocks.get(key));

        if (sortedBlocks.length <= 1) {
            throw new Error('the number of data blocks must be greater than 1');
        }

        if (!config) {
            config = {
                hashFunc: this.defaultHashFunc,
                numRoutines: 0,
                mode: TypeConfigMode.ModeProofGen,
                runInParallel: false,
                sortSiblingPairs: false,
                disableLeafHashing: false,
            };
        }

        this.config = config;
        this.numLeaves = blocks.size;
        this.depth = Math.floor(Math.log2(sortedBlocks.length - 1)) + 1;
        this.keys = keys;

        if (!this.config.hashFunc) {
            if (this.config.runInParallel) {
                this.config.hashFunc = this.defaultHashFuncParallel;
            } else {
                this.config.hashFunc = this.defaultHashFunc;
            }
        }

        if (!this.concatHashFunc) {
            if (this.config.sortSiblingPairs) {
                this.concatHashFunc = this.concatSortHash;
            } else {
                this.concatHashFunc = this.concatHash;
            }
        }

        if (this.config.runInParallel) {
            if (this.config.numRoutines <= 0) {
                this.config.numRoutines = os.cpus().length;
            }

            this.wp = new Pool<WorkerArgs, Error>(this.config.numRoutines, 0);
            this.leaves = await this.generateLeavesInParallel(sortedBlocks);
        } else {
            this.leaves = await this.generateLeaves(sortedBlocks);
        }

        if (this.config.mode === TypeConfigMode.ModeProofGen) {
            await this.generateProofs();
            return;
        }

        this.leafMap = new Map<string, number>();

        if (this.config.mode === TypeConfigMode.ModeTreeBuild) {
            await this.buildTree();
            return;
        }

        if (this.config.mode === TypeConfigMode.ModeProofGenAndTreeBuild) {
            await this.buildTree();
            this.initProofs();

            if (this.config.runInParallel) {
                for (let i = 0; i < this.nodes.length; i++) {
                    await this.updateProofsInParallel(this.nodes[i], this.nodes[i].length, i);
                }
                return;
            }

            for (let i = 0; i < this.nodes.length; i++) {
                await this.updateProofs(this.nodes[i], this.nodes[i].length, i);
            }
            return;
        }

        throw new Error('invalid configuration mode');
    }

    private async generateProofs(): Promise<void> {
        this.initProofs();
        let buffer = [...this.leaves];
        let bufferLength = this.fixOddLength(buffer, this.numLeaves);

        if (this.config.runInParallel) {
            await this.generateProofsInParallel(buffer, bufferLength);
        } else {
            await this.updateProofs(buffer, this.numLeaves, 0);
            let err: Error;
            for (let step = 1; step < this.depth; step++) {
                for (let idx = 0; idx < bufferLength; idx += 2) {
                    buffer[idx >> 1] = await this.config.hashFunc(this.concatHashFunc(buffer[idx], buffer[idx + 1]));
                }
                bufferLength >>= 1;
                [buffer, bufferLength] = this.fixOddLength(buffer, bufferLength);
                await this.updateProofs(buffer, bufferLength, step);
            }
            this.root = await this.config.hashFunc(this.concatHashFunc(buffer[0], buffer[1]));
        }
    }

    private async generateProofsInParallel(buffer: Buffer[], bufferLength: number): Promise<void> {
        const tempBuffer: Buffer[] = new Array(bufferLength >> 1);
        await this.updateProofsInParallel(buffer, this.numLeaves, 0);
        let numRoutines = this.config.numRoutines;

        for (let step = 1; step < this.depth; step++) {
            if (numRoutines > bufferLength) {
                numRoutines = bufferLength;
            }

            const argList: WorkerArgs[] = new Array(numRoutines);
            for (let i = 0; i < numRoutines; i++) {
                argList[i] = {
                    generateProofs: {
                        hashFunc: this.config.hashFunc,
                        concatHashFunc: this.concatHashFunc,
                        buffer,
                        tempBuffer,
                        startIdx: i << 1,
                        bufferLength,
                        numRoutines,
                    },
                };
            }

            const errList = await this.wp.map(workerGenerateProofs, argList);
            for (const err of errList) {
                if (err) {
                    throw err;
                }
            }

            [buffer, tempBuffer] = [tempBuffer, buffer];
            bufferLength >>= 1;
            [buffer, bufferLength] = this.fixOddLength(buffer, bufferLength);
            await this.updateProofsInParallel(buffer, bufferLength, step);
        }

        this.root = await this.config.hashFunc(this.concatHashFunc(buffer[0], buffer[1]));
    }

    private fixOddLength(buffer: Buffer[], bufferLength: number): [Buffer[], number] {
        if (bufferLength & 1) {
            const appendNode = buffer[bufferLength - 1];
            bufferLength++;
            if (buffer.length < bufferLength) {
                buffer.push(appendNode);
            } else {
                buffer[bufferLength - 1] = appendNode;
            }
        }
        return [buffer, bufferLength];
    }

    private async updateProofs(buffer: Buffer[], bufferLength: number, step: number): Promise<void> {
        const batch = 1 << step;
        for (let i = 0; i < bufferLength; i += 2) {
            this.updateProofPairs(buffer, i, batch, step);
        }
    }

    private async updateProofPairs(buffer: Buffer[], idx: number, batch: number, step: number): Promise<void> {
        const start = idx * batch;
        const end = Math.min(start + batch, this.proofs.length);
        for (let i = start; i < end; i++) {
            this.proofs[i].path += 1 << step;
            this.proofs[i].siblings.push(buffer[idx + 1]);
        }
        const newStart = start + batch;
        const newEnd = Math.min(newStart + batch, this.proofs.length);
        for (let i = newStart; i < newEnd; i++) {
            this.proofs[i].siblings.push(buffer[idx]);
        }
    }

    private async generateLeaves(blocks: DataBlock[]): Promise<Buffer[][]> {
        const leaves: Buffer[][] = new Array(this.numLeaves);
        for (let i = 0; i < this.numLeaves; i++) {
            leaves[i] = await dataBlockToLeaf(blocks[i], this.config);
        }
        return leaves;
    }

    private async generateLeavesInParallel(blocks: DataBlock[]): Promise<Buffer[][]> {
        const leaves: Buffer[][] = new Array(this.numLeaves);
        const numRoutines = this.config.numRoutines;
        if (numRoutines > this.numLeaves) {
            numRoutines = this.numLeaves;
        }

        const argList: WorkerArgs[] = new Array(numRoutines);
        for (let i = 0; i < numRoutines; i++) {
            argList[i] = {
                generateLeaves: {
                    dataBlocks: blocks,
                    config: this.config,
                    startIdx: i,
                    numRoutines,
                },
            };
        }

        const result = await this.wp.map(workerGenerateLeaves, argList);
        for (const [startIdx, leavesPart] of result.entries()) {
            for (let i = 0; i < leavesPart.length; i++) {
                leaves[startIdx + i * numRoutines] = leavesPart[i];
            }
        }

        return leaves;
    }

    private async buildTree(): Promise<void> {
        this.nodes = new Array(this.depth);
        this.nodes[0] = this.leaves;
        for (let step = 1; step < this.depth; step++) {
            const nodes: Buffer[][] = new Array(this.nodes[step - 1].length >> 1);
            for (let i = 0; i < nodes.length; i++) {
                nodes[i] = await this.config.hashFunc(this.concatHashFunc(this.nodes[step - 1][i << 1], this.nodes[step - 1][(i << 1) + 1]));
            }
            this.nodes[step] = nodes;
        }
        this.root = this.nodes[this.depth - 1][0];
    }

    private initProofs(): void {
        this.proofs = new Array(this.numLeaves);
        for (let i = 0; i < this.numLeaves; i++) {
            this.proofs[i] = {
                siblings: [],
                path: 0,
            };
        }
    }

    private concatHash(b1: Buffer, b2: Buffer): Buffer {
        const result = Buffer.concat([b1, b2]);
        return result;
    }

    private concatSortHash(b1: Buffer, b2: Buffer): Buffer {
        if (b1.compare(b2) < 0) {
            return this.concatHash(b1, b2);
        }
        return this.concatHash(b2, b1);
    }

    private async defaultHashFunc(data: Buffer): Promise<Buffer> {
        sha256Digest.update(data);
        const result = sha256Digest.digest();
        sha256Digest.reset();
        return result;
    }

    private async defaultHashFuncParallel(data: Buffer): Promise<Buffer> {
        const digest = createHash('sha256');
        digest.update(data);
        const result = digest.digest();
        return result;
    }
}

interface WorkerArgsGenerateProofs {
    hashFunc: TypeHashFunc;
    concatHashFunc: TypeConcatHashFunc;
    buffer: Buffer[];
    tempBuffer: Buffer[];
    startIdx: number;
    bufferLength: number;
    numRoutines: number;
}

interface WorkerArgsUpdateProofs {
    tree: MerkleTree;
    buffer: Buffer[];
    startIdx: number;
    batch: number;
    step: number;
    bufferLength: number;
    numRoutines: number;
}

interface WorkerArgsGenerateLeaves {
    dataBlocks: DataBlock[];
    config: Config;
    startIdx: number;
    numRoutines: number;
}

interface WorkerArgs {
    generateProofs?: WorkerArgsGenerateProofs;
    updateProofs?: WorkerArgsUpdateProofs;
    generateLeaves?: WorkerArgsGenerateLeaves;
}

async function workerGenerateProofs(args: WorkerArgs): Promise<Error | undefined> {
    const chosenArgs = args.generateProofs;
    const { hashFunc, concatHashFunc, buffer, tempBuffer, startIdx, bufferLength, numRoutines } = chosenArgs;
    for (let i = startIdx; i < bufferLength; i += numRoutines << 1) {
        try {
            const newHash = await hashFunc(concatHashFunc(buffer[i], buffer[i + 1]));
            tempBuffer[i >> 1] = newHash;
        } catch (err) {
            return err;
        }
    }
}

async function workerUpdateProofs(args: WorkerArgs): Promise<Error | undefined> {
    const chosenArgs = args.updateProofs;
    const { tree, buffer, startIdx, batch, step, bufferLength, numRoutines } = chosenArgs;
    for (let i = startIdx; i < bufferLength; i += numRoutines << 1) {
        tree.updateProofPairs(buffer, i, batch, step);
    }
}

async function workerGenerateLeaves(args: WorkerArgs): Promise<Buffer[][]> {
    const chosenArgs = args.generateLeaves;
    const { dataBlocks, config, startIdx, numRoutines } = chosenArgs;
    const leaves: Buffer[][] = new Array(Math.ceil(dataBlocks.length / numRoutines));
    for (let i = 0; i < leaves.length; i++) {
        leaves[i] = [];
    }
    for (let i = startIdx; i < dataBlocks.length; i += numRoutines) {
        const leaf = await dataBlockToLeaf(dataBlocks[i], config);
        leaves[Math.floor(i / numRoutines)].push(leaf);
    }
    return leaves;
}

async function dataBlockToLeaf(block: DataBlock, config: Config): Promise<Buffer> {
    const blockBytes = await block.serialize();
    if (config.disableLeafHashing) {
        const leaf = Buffer.from(blockBytes);
        return leaf;
    }
    return config.hashFunc(blockBytes);
}

function min(a: number, b: number): number {
    return a < b ? a : b;
}

function generateLeaves(m: MerkleTree, blocks: DataBlock[]): Promise<Buffer[]> {
    return new Promise((resolve, reject) => {
        const leaves: Buffer[] = new Array(m.NumLeaves);
        let err: Error | null = null;
        for (let i = 0; i < m.NumLeaves; i++) {
            try {
                leaves[i] = dataBlockToLeaf(blocks[i], m.Config);
            } catch (error) {
                err = error;
                break;
            }
        }
        if (err) {
            reject(err);
        } else {
            resolve(leaves);
        }
    });
}

function dataBlockToLeaf(block: DataBlock, config: Config): Buffer {
    const blockBytes = block.Serialize();
    if (config.DisableLeafHashing) {
        const leaf = Buffer.alloc(blockBytes.length);
        blockBytes.copy(leaf);
        return leaf;
    }
    return config.HashFunc(blockBytes);
}

interface WorkerArgsGenerateLeaves {
    config: Config;
    dataBlocks: DataBlock[];
    leaves: Buffer[];
    startIdx: number;
    lenLeaves: number;
    numRoutines: number;
}

function workerGenerateLeaves(args: WorkerArgsGenerateLeaves): Promise<null> {
    return new Promise((resolve, reject) => {
        const { config, dataBlocks, leaves, startIdx, lenLeaves, numRoutines } = args;
        let err: Error | null = null;
        for (let i = startIdx; i < lenLeaves; i += numRoutines) {
            try {
                leaves[i] = dataBlockToLeaf(dataBlocks[i], config);
            } catch (error) {
                err = error;
                break;
            }
        }
        if (err) {
            reject(err);
        } else {
            resolve(null);
        }
    });
}

function generateLeavesInParallel(m: MerkleTree, blocks: DataBlock[]): Promise<Buffer[]> {
    return new Promise((resolve, reject) => {
        const lenLeaves = blocks.length;
        const leaves: Buffer[] = new Array(lenLeaves);
        let numRoutines = m.NumRoutines;
        if (numRoutines > lenLeaves) {
            numRoutines = lenLeaves;
        }
        const argList: WorkerArgs[] = new Array(numRoutines);
        for (let i = 0; i < numRoutines; i++) {
            argList[i] = {
                generateLeaves: {
                    config: m.Config,
                    dataBlocks: blocks,
                    leaves,
                    startIdx: i,
                    lenLeaves,
                    numRoutines,
                },
            };
        }
        m.wp.Map(workerGenerateLeaves, argList)
            .then(() => {
                resolve(leaves);
            })
            .catch((err) => {
                reject(err);
            });
    });
}

function buildTree(m: MerkleTree): Promise<null> {
    return new Promise((resolve, reject) => {
        const finishMap = new Promise((resolve) => {
            m.leafMapMu.Lock();
            for (let i = 0; i < m.NumLeaves; i++) {
                m.leafMap.set(m.Leaves[i].toString(), i);
            }
            m.leafMapMu.Unlock();
            resolve();
        });
        m.nodes = new Array(m.Depth);
        m.nodes[0] = m.Leaves.slice();
        let bufferLength = m.NumLeaves;
        [m.nodes[0], bufferLength] = m.fixOddLength(m.nodes[0], m.NumLeaves);
        if (m.RunInParallel) {
            m.computeTreeNodesInParallel(bufferLength)
                .then(() => {
                    resolve(null);
                })
                .catch((err) => {
                    reject(err);
                });
        } else {
            let err: Error | null = null;
            for (let i = 0; i < m.Depth - 1; i++) {
                m.nodes[i + 1] = new Array(bufferLength >> 1);
                for (let j = 0; j < bufferLength; j += 2) {
                    try {
                        m.nodes[i + 1][j >> 1] = m.HashFunc(
                            m.concatHashFunc(m.nodes[i][j], m.nodes[i][j + 1])
                        );
                    } catch (error) {
                        err = error;
                        break;
                    }
                }
                if (err) {
                    break;
                }
                [m.nodes[i + 1], bufferLength] = m.fixOddLength(m.nodes[i + 1], m.nodes[i + 1].length);
            }
            if (err) {
                reject(err);
            } else {
                try {
                    m.Root = m.HashFunc(m.concatHashFunc(m.nodes[m.Depth - 1][0], m.nodes[m.Depth - 1][1]));
                    finishMap.then(() => {
                        resolve(null);
                    });
                } catch (error) {
                    reject(error);
                }
            }
        }
    });
}

interface WorkerArgsComputeTreeNodes {
    tree: MerkleTree;
    startIdx: number;
    bufferLength: number;
    numRoutines: number;
    depth: number;
}

function workerBuildTree(args: WorkerArgs): Promise<null> {
    return new Promise((resolve, reject) => {
        const { tree, startIdx, bufferLength, numRoutines, depth } = args.computeTreeNodes;
        let err: Error | null = null;
        for (let i = startIdx; i < bufferLength; i += numRoutines << 1) {
            try {
                const newHash = tree.HashFunc(tree.concatHashFunc(tree.nodes[depth][i], tree.nodes[depth][i + 1]));
                tree.nodes[depth + 1][i >> 1] = newHash;
            } catch (error) {
                err = error;
                break;
            }
        }
        if (err) {
            reject(err);
        } else {
            resolve(null);
        }
    });
}

function computeTreeNodesInParallel(m: MerkleTree, bufferLength: number): Promise<null> {
    return new Promise((resolve, reject) => {
        const promises: Promise<null>[] = [];
        for (let i = 0; i < m.Depth - 1; i++) {
            m.nodes[i + 1] = new Array(bufferLength >> 1);
            let numRoutines = m.NumRoutines;
            if (numRoutines > bufferLength) {
                numRoutines = bufferLength;
            }
            const argList: WorkerArgs[] = new Array(numRoutines);
            for (let j = 0; j < numRoutines; j++) {
                argList[j] = {
                    computeTreeNodes: {
                        tree: m,
                        startIdx: j << 1,
                        bufferLength,
                        numRoutines: m.NumRoutines,
                        depth: i,
                    },
                };
            }
            promises.push(m.wp.Map(workerBuildTree, argList));
            [m.nodes[i + 1], bufferLength] = m.fixOddLength(m.nodes[i + 1], m.nodes[i + 1].length);
        }
        Promise.all(promises)
            .then(() => {
                resolve(null);
            })
            .catch((err) => {
                reject(err);
            });
    });
}

function Verify(dataBlock: DataBlock, proof: Proof, root: Buffer, config?: Config): boolean {
    if (!dataBlock) {
        throw new Error("ErrDataBlockIsNil");
    }
    if (!proof) {
        throw new Error("ErrProofIsNil");
    }
    if (!config) {
        config = new Config();
    }
    if (!config.HashFunc) {
        config.HashFunc = DefaultHashFunc;
    }
    let concatFunc = concatHash;
    if (config.SortSiblingPairs) {
        concatFunc = concatSortHash;
    }
    const leaf = dataBlockToLeaf(dataBlock, config);
    let result = Buffer.from(leaf);
    let path = proof.Path;
    for (const sib of proof.Siblings) {
        if (path & 1) {
            result = config.HashFunc(concatFunc(result, sib));
        } else {
            result = config.HashFunc(concatFunc(sib, result));
        }
        path >>= 1;
    }
    return result.equals(root);
}

function Proof(m: MerkleTree, dataBlock: DataBlock): Promise<Proof> {
    return new Promise((resolve, reject) => {
        if (m.Mode !== ModeTreeBuild && m.Mode !== ModeProofGenAndTreeBuild) {
            reject(new Error("ErrProofInvalidModeTreeNotBuilt"));
        }
        let leaf: Buffer;
        try {
            leaf = dataBlockToLeaf(dataBlock, m.Config);
        } catch (error) {
            reject(error);
            return;
        }
        m.leafMapMu.Lock();
        const idx = m.leafMap.get(leaf.toString());
        m.leafMapMu.Unlock();
        if (idx === undefined) {
            reject(new Error("ErrProofInvalidDataBlock"));
            return;
        }
        const path = idx & 1 ? 0 : 1;
        const siblings: Buffer[] = new Array(m.Depth);
        for (let i = 0; i < m.Depth; i++) {
            if (idx & 1) {
                siblings[i] = m.nodes[i][idx - 1];
            } else {
                siblings[i] = m.nodes[i][idx + 1];
            }
            idx >>= 1;
        }
        resolve({
            Path: path,
            Siblings: siblings,
        });
    });
}
*/