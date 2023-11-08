import MerkleTools from 'merkle-tools';

export type TreeContent = {
    leafs: Record<string, string>;
};

export const createTree = (): TreeContent => {
    return { leafs: {} };
};

export const addLeaf = (tc: TreeContent, key: string, data: string): void => {
    tc.leafs[key] = data;
};

export const buildTree = (tc: TreeContent): MerkleTools => {
    const merkleTools = new MerkleTools({ hashType: 'SHA256' });

    const sortedKeys = Object.keys(tc.leafs).sort();
    const sortedValues = sortedKeys.map(key => tc.leafs[key]);

    merkleTools.addLeaves(sortedValues);
    merkleTools.makeTree();
    return merkleTools;
};

export const verifyTree = (tree: MerkleTools): boolean => {
    const root = tree.getMerkleRoot();
    const leafCount = tree.getLeafCount();
    let result = true;

    if (root === null) {
        console.log("Root is null for leaf");
        result = false;
    }
    else {
        for (let i = 0; i < leafCount; i++) {
            const proofs = tree.getProof(i);
            const leaf = tree.getLeaf(i);

            if (leaf === null) {
                console.log("Leaf is null at index", i);
                result = false;
                break;
            }

            if (proofs === null) {
                console.log("Proofs are null for leaf at index", i);
                result = false;
                break;
            }

            for (const proof of proofs) {
                const isValid = tree.validateProof(proof, leaf, root);
                if (!isValid) {
                    result = false;
                    console.log("Verification failed for leaf");
                    break;
                }
            }

            if (!result) {
                break;
            }
        }
    }

    return result;
};