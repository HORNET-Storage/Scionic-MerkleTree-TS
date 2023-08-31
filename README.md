# Scionic Merkle Trees

## An Evolution of Merkle DAGs and Merkle Trees

We've designed a new type of Merkle Tree/DAG. Scionic Merkle Trees have small branches like Classic Merkle trees, the file storage ability of Merkle DAGs, and numbered leaves so relays can request a range of missing leaf numbers to sync quickly. They are an innovative model that merge the advantages of Classic Merkle trees and Merkle DAGs while addressing several of their limitations.

![Tree Comparison Diagram](https://i.ibb.co/5LGmSqm/Tree-Comparison-Diagram.png)

## Classic Merkle Trees and Merkle DAGs: A Comparison

### ***Classic Merkle Trees***

Classic Merkle Trees are cryptographic structures used to manage and securely verify large amounts of data. However, they have a significant drawback: they cannot store folders or files.

The number of hashes required for a Merkle proof in a Classic Merkle Tree grows logarithmically with the number of files, meaning the growth rate slows as the input (tree) size increases. This pattern makes them very efficient for large datasets because the branches become exponentially smaller as the number of files in the folder rises.

### ***Merkle DAGs (Directed Acyclic Graphs)***

Merkle DAGs were developed as a solution to incorporate folders and files, addressing a key limitation of Classic Merkle Trees. However, this structure has its own challenge: to securely download a single file, you must download the hash of every other file inside the folder its stored in. This requirement can be slow and costly for users when dealing with folders that contain large amounts of files.

## The Strengths of Scionic Merkle Trees

### ***Folders and Files:***

Like Merkle DAGs, Scionic Merkle Trees can accommodate folders and files. However, they also maintain the efficiency of Classic Merkle trees.

### ***Internal Arrangement:***

The unique feature of Scionic Merkle Trees is their internal structure. Within each folder (parent leaf) across the tree, its list of files (children) is organized as a Classic Merkle tree rather than a plaintext list.

### ***Efficient File Download and Branch Verification:***

If a user wants a specific file from a folder on the tree, they no longer need to download every hash in the folder. Instead, they download a Classic Merkle branch linked to the folder (parent leaf) they're downloading the file from. This process allows the user to verify that the file is part of the tree without needing to download every hash of all other files in the folder.

### ***Improved Scalability for Users with Large Datasets:***

This streamlined process significantly improves efficiency, especially with large datasets. Scionic Merkle Trees are a powerful tool for handling folders with numerous files, combining the directory-friendly nature of Merkle DAGs and the compact efficiency of Classic Merkle Trees.

![Scionic Merkle Tree Diagram](https://i.ibb.co/XJjbwmP/Scionic-Merkle-Tree.jpg)

## Scionic Merkle Branch Statistics

*Comparing the size of a Scionic Merkle Branch to bloated Merkle DAG Branches:*

* For a folder containing 10 files, a Scionic branch needs just 5 leaves, while a Merkle DAG branch requires all 10. This makes the Scionic branch about **2x smaller**.
* When the folder contains 1000 files, a Scionic branch uses only 11 leaves, compared to the full 1000 required by a Merkle DAG branch. This results in the Scionic branch being approximately **90x smaller**.
* In the case of a folder with 10,000 files, a Scionic branch requires 15 leaves, while a Merkle DAG branch needs all 10,000. This means the Scionic branch is roughly **710x smaller**.
* If the folder contains 1,000,000 files, a Scionic branch for any file in that folder would require around 21 leaves. This Scionic branch would be **50,000x smaller**.

These statistics underline the substantial efficiency improvements made by Scionic Merkle Trees.

## Understanding Growth Patterns: Logarithmic vs Linear

In the case of Scionic Merkle Trees, which incorporate Classic Merkle Trees within their structure, they exhibit logarithmic growth. This means that as the size of the input (the number of files in a folder) increases, the growth rate of the Classic Merkle Tree branches slow down. This makes Scionic Merkle Trees an efficient structure for managing large datasets, ***as the branches become exponentially smaller with the increasing number of files in the folder.***

In stark contrast, the number of hashes required to validate a single folder in a Merkle DAG exhibits linear growth. If there are more children (files) in the folder, you must download the hashes to all of them to retrieve a single file. This constant requirement can lead to overly large merkle branches. The amount of hashes needed to validate a single file increases in direct proportion to the number of files in the folder, making it less efficient for large datasets, as it demands more computational work from users for each new file added to a folder in the DAG.

## Syncing Trees Across Relays by Requesting a Range of Leafs

To further enhance the functionality of Scionic Merkle Trees and support efficient data retrieval, each leaf in the tree is labelled with a unique number. This method facilitates the request for ranges of leafs, much like what Graphsync attempts to accomplish, but without the complexity of converting a tree into a graph.

The total number of leafs is recorded at the root of the tree, and each folder also carries information about the total number of leafs it contains. By doing so, users can request a range of leafs from a given folder, simplifying data retrieval, and reducing the bandwidth overhead and computational workload required to access multiple files from the same folder.

This approach not only maintains the structural advantages of Scionic Merkle Trees, such as logarithmic growth of branches and efficient file download and verification, but also provides enhanced support for range queries, contributing to their practicality in large-scale data management scenarios.

##

#### Install
```
npm install scionic-merkletree
```

#### Example Usage
```

```

This repository is not in a functioning state yet and should not be used at all until a release build has been published.
