"use client";

import { ChevronRight, FileText } from "lucide-react";
import type { TreeNode } from "./tree";
import styles from "./Docs.module.css";

// The sidebar's nested list of pages. Subpages are a group under their parent.
export default function DocTree({ nodes, selected, onSelect, depth = 0 }: { nodes: TreeNode[]; selected: string; onSelect: (id: string) => void; depth?: number }) {
  return <ul className={styles.treeList} role={depth ? "group" : undefined}>{nodes.map(node => <li key={node.id}>
    <button type="button" aria-current={node.id === selected ? "page" : undefined} style={{ paddingLeft: 10 + depth * 14 }} onClick={() => onSelect(node.id)}>
      {node.children.length ? <ChevronRight size={13} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}<span>{node.title}</span>
    </button>
    {node.children.length > 0 && <DocTree nodes={node.children} selected={selected} onSelect={onSelect} depth={depth + 1} />}
  </li>)}</ul>;
}
