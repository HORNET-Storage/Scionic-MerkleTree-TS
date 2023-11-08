import MerkleTree from "merkle-tools";
import { TreeContent, addLeaf, buildTree, createTree } from "./tree/tree";
import { DagLeafBuilder, LeafType, DagBuilder, DagLeaf } from "./types";
import { split } from 'lodash';
import * as cbor from 'cbor';
import { createHash } from "crypto";
import multibase = require("multibase");
import { BaseNameOrCode } from "multibase";

export function CreateDagBuilder(): DagBuilder {
    const builder: DagBuilder = {
        Leafs: {}
    }

    return builder
}

export function AddLeaf(dag: DagBuilder, leaf: DagLeaf, encoder: BaseNameOrCode, parentLeaf: DagLeaf) {
    if (parentLeaf != undefined) {
        const label = GetLabel(leaf.Hash)

        if (label !in parentLeaf.Links) {
            AddLeafLink(parentLeaf, leaf.Hash)
        }
    }

    dag.Leafs[leaf.Hash] = leaf
}

export function CreateDagLeafBuilder(name: string): DagLeafBuilder {
    let builder: DagLeafBuilder = {
        Name: name,
        Label: 0,
        LeafType: "directory",
        Data: new Uint8Array(),
        Links: {},
    }

    return builder;
}

export function SetType(builder: DagLeafBuilder, type: LeafType) {
    builder.LeafType = type;
}

export function SetData(builder: DagLeafBuilder, data: Uint8Array) {
    builder.Data = data
}

export function AddLink(builder: DagLeafBuilder, label: string, hash: string) {
    builder.Links[label] = label + ":" + hash
}

export function AddLeafLink(leaf: DagLeaf, hash: string) {
    const label = GetLabel(hash)

    if (label == "") {

    }

    leaf.Links[label] = hash
}

export function GetLatestLabel(builder: DagBuilder): string {
    let result: string = "1";
    let latestLabel: number = 1;

    Object.keys(builder.Leafs).forEach(hash => {
        let label: string = GetLabel(hash);

        if (label == "") {
            console.log("Failed to find label in hash");
        }

        let parsed = parseInt(label);

        if (parsed > latestLabel) {
            latestLabel = parsed
            result = label
        }
    });

    return result
}

export function GetNextAvailableLabel(builder: DagBuilder): string {
    let latestLabel: string = GetLatestLabel(builder);
    let number: number = parseInt(latestLabel);

    let nextLabel: string = (number + 1).toString();

    return nextLabel;
}

export function BuildLeaf(builder: DagLeafBuilder, encoder: BaseNameOrCode): DagLeaf {
    let merkleRoot: Uint8Array = new Uint8Array();

    if (Object.keys(builder.Links).length > 1) {
        let treeContent: TreeContent = createTree();

        Object.keys(builder.Links).forEach(hash => {
            addLeaf(treeContent, GetLabel(hash), hash);
        })

        let tree: MerkleTree = buildTree(treeContent);

        let buffer = tree.getMerkleRoot();

        if (buffer != null) {
            merkleRoot = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
        }
    }

    let leafData = {
        Name: builder.Name,
        Type: builder.LeafType,
        MerkleRoot: merkleRoot,
        CurrentLinkCount: Object.keys(builder.Links).length,
        Data: builder.Data,
    }

    const cborLeafData = cbor.encode(leafData)

    let hashBuffer = createHash('sha256').update(cborLeafData).digest();
    const hash = multibase.encode(encoder, hashBuffer).toString()

    const result: DagLeaf = {
        Hash: hash,
        Name: builder.Name,
        Type: builder.LeafType,
        MerkleRoot: merkleRoot,
        CurrentLinkCount: Object.keys(builder.Links).length,
        Data: builder.Data,
        Links: builder.Links,
        LatestLabel: undefined,
        LeafCount: undefined,
        ParentHash: undefined
    };

    return result
}

export function BuildRootLeaf(builder: DagLeafBuilder, dag: DagBuilder, encoder: BaseNameOrCode): DagLeaf {
    let merkleRoot: Uint8Array = new Uint8Array();

    if (Object.keys(builder.Links).length > 1) {
        let treeContent: TreeContent = createTree();

        Object.keys(builder.Links).forEach(hash => {
            addLeaf(treeContent, GetLabel(hash), hash);
        })

        let tree: MerkleTree = buildTree(treeContent);

        let buffer = tree.getMerkleRoot();

        if (buffer != null) {
            merkleRoot = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.length);
        }
    }

    const latestLabel = GetLatestLabel(dag)
    const leafCount = Object.keys(dag.Leafs).length
    const currentLinkCount = Object.keys(builder.Links).length

    let leafData = {
        Name: builder.Name,
        Type: builder.LeafType,
        MerkleRoot: merkleRoot,
        latestLabel: latestLabel,
        CurrentLinkCount: currentLinkCount,
        LeafCount: leafCount,
        Data: builder.Data,
    }

    const cborLeafData = cbor.encode(leafData)

    let hashBuffer = createHash('sha256').update(cborLeafData).digest();
    const hash = multibase.encode(encoder, hashBuffer).toString()

    const result: DagLeaf = {
        Hash: hash,
        Name: builder.Name,
        Type: builder.LeafType,
        MerkleRoot: merkleRoot,
        CurrentLinkCount: Object.keys(builder.Links).length,
        Data: builder.Data,
        Links: builder.Links,
        LatestLabel: latestLabel,
        LeafCount: currentLinkCount,
        ParentHash: undefined
    };

    return result
}

export function GetLabel(hash: string): string {
    const parts: string[] = split(hash, ':');
    if (parts.length !== 2) {
        return '';
    }
    return parts[0];
}
