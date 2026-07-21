"use client";

import { useEffect, useMemo, useState } from "react";
import { reaction } from "mobx";
import { useStores } from "@/lib/services/StoreProvider";
import { useTestomatio } from "@/lib/agent-output/use-testomatio";

export interface Option {
  label: string;
  value: string;
}

export interface ProjectFilterOptions {
  environments: string[];
  labels: { title: string; slug: string }[];
  tags: string[];
}

export function useProjectFilterOptions(): ProjectFilterOptions {
  const store = useStores();
  const [info, setInfo] = useState(store.project.projectInfo);
  useEffect(
    () =>
      reaction(() => store.project.projectInfo, setInfo, {
        fireImmediately: true,
      }),
    [store],
  );
  // `/info` is the only directory for labels, tags and environments, and it
  // fails on projects whose stored config the backend cannot parse. Labels have
  // their own endpoint, so read it rather than reporting a project with visible
  // labels as having none. Tags and environments have no such endpoint — the
  // checkbox filter falls back to the loaded rows and says so.
  const { data: labelDefs } = useTestomatio<LabelDefinition[]>(
    "labels",
    { per_page: 100 },
    { skip: Boolean(info?.labels?.length) },
  );
  return useMemo(() => {
    let labels = info?.labels ?? [];
    if (!labels.length && labelDefs?.length) {
      labels = labelDefs.map((item) => ({ title: item.title, slug: item.id }));
    }
    return {
      environments: info?.environments ?? [],
      labels,
      tags: info?.tags ?? [],
    };
  }, [info, labelDefs]);
}

export function useRungroupOptions(enabled: boolean): Option[] {
  const { data } = useTestomatio<TreeNode[]>(
    "rungroups",
    { per_page: 100 },
    { skip: !enabled },
  );
  return useMemo(() => (data ? flattenTree(data) : []), [data]);
}

export function useSuiteOptions(enabled: boolean): Option[] {
  const { data } = useTestomatio<TreeNode[]>(
    "suites",
    { per_page: 100 },
    { skip: !enabled },
  );
  return useMemo(() => (data ? flattenTree(data) : []), [data]);
}

function flattenTree(nodes: TreeNode[], depth = 0, acc: Option[] = []): Option[] {
  for (const node of nodes) {
    const title = node.clean_title ?? node.title ?? String(node.id ?? "");
    const prefix = depth > 0 ? `${"— ".repeat(depth)}` : "";
    if (node.id != null) acc.push({ value: String(node.id), label: prefix + title });
    if (node.children?.length) flattenTree(node.children, depth + 1, acc);
  }
  return acc;
}

interface TreeNode {
  id?: string | number;
  title?: string;
  clean_title?: string;
  children?: TreeNode[];
}

interface LabelDefinition {
  id: string;
  title: string;
}
