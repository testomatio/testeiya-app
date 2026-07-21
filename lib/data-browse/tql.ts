import type { ColKind, TqlOperator } from "@/lib/table-schema";
import type { Option } from "@/components/data-table/types";

export type { TqlOperator };

export const TQL_OPERATOR_LABELS: Record<TqlOperator, string> = {
  eq: "is",
  neq: "is not",
  in: "is any of",
  nin: "is none of",
  contains: "contains",
  gt: "is after",
  lt: "is before",
  gte: "is at least",
  lte: "is at most",
  between: "is between",
};

const OPERATOR_SYMBOLS: Record<TqlOperator, string> = {
  eq: "==",
  neq: "!=",
  in: "in",
  nin: "not in",
  contains: "%",
  gt: ">",
  lt: "<",
  gte: ">=",
  lte: "<=",
  between: "between",
};

// `not in` is rejected upstream ("Unhandled operator type !") — negation is
// only available as `!=` on a single value.
const OPERATORS_BY_KIND: Record<string, TqlOperator[]> = {
  // `contains` stays first — it is what a fresh string row defaults to.
  string: ["contains", "eq", "neq", "in"],
  enum: ["eq", "neq", "in"],
  // `!=` on a multi-valued field reads as "does not carry this value" and its
  // count complements `==` exactly (verified on label, tag and suite).
  array: ["in", "eq", "neq"],
  boolean: ["eq"],
  number: ["eq", "neq", "gte", "lte", "between"],
  timestamp: ["between", "gt", "lt"],
};

export function operatorsForKind(
  kind: ColKind,
  allowed?: TqlOperator[],
): TqlOperator[] {
  const base = OPERATORS_BY_KIND[kind] ?? ["eq", "neq"];
  if (!allowed) return base;
  return base.filter((op) => allowed.includes(op));
}

export function defaultOperator(field: TqlField): TqlOperator {
  return field.operators[0] ?? "eq";
}

export function isMultiValue(operator: TqlOperator): boolean {
  return operator === "in" || operator === "nin";
}

export function isTqlGroup(node: TqlNode): node is TqlGroup {
  return "children" in node;
}

export function serializeTql(query: TqlGroup, fields: TqlField[]): string {
  return serializeGroup(query, fields, 0);
}

export function parseTql(input: string, fields: TqlField[]): TqlParseResult {
  const text = input.trim();
  if (!text) return { ok: true, query: { connector: "and", children: [] } };

  const quoteError = checkBalance(text);
  if (quoteError) return { ok: false, error: quoteError };

  const parsed = parseGroup(text, fields, 0);
  if (!parsed.ok) return parsed;
  return { ok: true, query: parsed.node };
}

export function validateTql(input: string, fields: TqlField[]): string | null {
  const result = parseTql(input, fields);
  if (result.ok) return null;
  return result.error;
}

function serializeGroup(
  group: TqlGroup,
  fields: TqlField[],
  depth: number,
): string {
  const parts: string[] = [];
  for (const child of group.children) {
    const clause = serializeNode(child, fields, depth + 1);
    if (clause) parts.push(clause);
  }
  if (!parts.length) return "";
  const joined = parts.join(` ${group.connector} `);
  if (!depth) return joined;
  return `(${joined})`;
}

function serializeNode(
  node: TqlNode,
  fields: TqlField[],
  depth: number,
): string | null {
  if (isTqlGroup(node)) return serializeGroup(node, fields, depth) || null;
  const field = fields.find((item) => item.key === node.field);
  if (!field) return null;
  return serializeCondition(node, field);
}

function parseGroup(
  text: string,
  fields: TqlField[],
  depth: number,
): ParseGroupResult {
  const split = splitTopLevel(text);
  if (split.error) return { ok: false, error: split.error };
  if (split.mixed) {
    return {
      ok: false,
      error: "Mixing and/or at the same level needs parentheses",
      representable: false,
    };
  }

  const children: TqlNode[] = [];
  for (const clause of split.clauses) {
    const parsed = parseNode(clause, fields, depth + 1);
    if (!parsed.ok) return parsed;
    if (isTqlGroup(parsed.node) && depth > 0) {
      return {
        ok: false,
        error: "Groups nested more than one level deep are not supported",
        representable: false,
      };
    }
    children.push(parsed.node);
  }

  return { ok: true, node: { connector: split.connector, children } };
}

function parseNode(
  raw: string,
  fields: TqlField[],
  depth: number,
): ParseNodeResult {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Empty condition" };
  if (/^not\s*\(/i.test(text)) {
    return {
      ok: false,
      error: "Negated groups are not supported in the builder",
      representable: false,
    };
  }

  const inner = stripParens(text);
  if (inner === text) {
    const split = splitTopLevel(text);
    if (split.clauses.length > 1) return parseGroup(text, fields, depth);
    return parseCondition(text, fields);
  }

  // A `between` serialises as `(name >= from and name <= to)`, so a
  // parenthesised range has to win over reading the parens as a group.
  const range = matchRange(inner, fields);
  if (range) return range;
  return parseGroup(inner, fields, depth);
}

function serializeCondition(
  condition: TqlCondition,
  field: TqlField,
): string | null {
  const name = field.tqlName;
  const { operator, value } = condition;

  if (operator === "between") {
    const range = toArray(value);
    if (range.length < 2) return null;
    const from = formatScalar(range[0], field);
    const to = formatScalar(range[1], field);
    return `(${name} >= ${from} and ${name} <= ${to})`;
  }

  if (isMultiValue(operator)) {
    const values = toArray(value);
    if (!values.length) return null;
    const list = values.map((item) => formatScalar(item, field)).join(", ");
    return `${name} ${OPERATOR_SYMBOLS[operator]} [${list}]`;
  }

  // A multi-select value can never be expressed with `==` — widen it to `in`
  // instead of silently dropping every value but the first.
  const values = toArray(value);
  if (operator === "eq" && values.length > 1) {
    const list = values.map((item) => formatScalar(item, field)).join(", ");
    return `${name} in [${list}]`;
  }

  const single = values[0];
  if (single === undefined || single === null || single === "") return null;
  return `${name} ${OPERATOR_SYMBOLS[operator]} ${formatScalar(single, field)}`;
}

function formatScalar(value: unknown, field: TqlField): string {
  // Calendar day in the user's own timezone — `toISOString()` would shift a
  // date picked at local midnight in UTC+N back to the previous day.
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `'${value.getFullYear()}-${month}-${day}'`;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (field.kind === "number") return String(Number(value));
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${escaped}'`;
}

function checkBalance(text: string): string | null {
  let quote: string | null = null;
  let depth = 0;
  let brackets = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === "\\") {
        i++;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "[") brackets++;
    if (char === "]") brackets--;
    if (depth < 0) return "Unexpected ')'";
    if (brackets < 0) return "Unexpected ']'";
  }
  if (quote) return "Unclosed quote";
  if (depth !== 0) return "Unclosed '('";
  if (brackets !== 0) return "Unclosed '['";
  return null;
}

function splitTopLevel(text: string): SplitResult {
  const clauses: string[] = [];
  const connectors: Connector[] = [];
  let quote: string | null = null;
  let depth = 0;
  let brackets = 0;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === "\\") {
        i++;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (char === "[") brackets++;
    if (char === "]") brackets--;
    if (depth > 0 || brackets > 0) continue;

    const rest = text.slice(i);
    const match = /^\s+(and|or)\s+/i.exec(rest);
    if (!match) continue;
    clauses.push(text.slice(start, i));
    connectors.push(match[1].toLowerCase() as Connector);
    i += match[0].length - 1;
    start = i + 1;
  }
  clauses.push(text.slice(start));

  const unique = Array.from(new Set(connectors));
  if (unique.length > 1) {
    return { clauses, connector: "and", mixed: true };
  }
  return { clauses, connector: unique[0] ?? "and", mixed: false };
}

function stripParens(text: string): string {
  if (!text.startsWith("(") || !text.endsWith(")")) return text;
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === "\\") {
        i++;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") depth++;
    if (char !== ")") continue;
    depth--;
    // The opening paren closes before the end, so it never wrapped the whole
    // expression — e.g. `(a) and (b)`.
    if (!depth && i < text.length - 1) return text;
  }
  return text.slice(1, -1).trim();
}

function parseCondition(raw: string, fields: TqlField[]): ParseNodeResult {
  const clause = raw.trim();
  if (!clause) return { ok: false, error: "Empty condition" };

  const match =
    /^([A-Za-z_][A-Za-z0-9_.]*)\s*(>=|<=|!=|==|=|>|<|%|not\s+in|in)\s*([\s\S]+)$/i.exec(
      clause,
    );
  if (!match) {
    return { ok: false, error: `Cannot parse condition: "${clause}"` };
  }

  const [, name, rawOp, rawValue] = match;
  const field = fields.find((item) => item.tqlName === name);
  if (!field) {
    const known = fields.map((item) => item.tqlName).join(", ");
    return { ok: false, error: `Unknown field "${name}". Available: ${known}` };
  }

  const operator = toOperator(rawOp);
  if (!operator) return { ok: false, error: `Unknown operator "${rawOp}"` };
  if (!field.operators.includes(operator)) {
    const allowed = field.operators
      .map((op) => TQL_OPERATOR_LABELS[op])
      .join(", ");
    return {
      ok: false,
      error: `"${field.label}" does not support "${TQL_OPERATOR_LABELS[operator]}". Allowed: ${allowed}`,
    };
  }

  const value = parseValue(rawValue.trim(), operator);
  if (value === undefined) {
    return { ok: false, error: `Cannot parse value in "${clause}"` };
  }

  const invalid = checkOptions(value, field);
  if (invalid) return { ok: false, error: invalid };

  return { ok: true, node: { field: field.key, operator, value } };
}

function matchRange(clause: string, fields: TqlField[]): ParseNodeResult | null {
  const match =
    /^([A-Za-z_][A-Za-z0-9_.]*)\s*>=\s*([\s\S]+?)\s+and\s+([A-Za-z_][A-Za-z0-9_.]*)\s*<=\s*([\s\S]+)$/i.exec(
      clause,
    );
  if (!match) return null;
  const [, left, from, right, to] = match;
  if (left !== right) return null;
  const field = fields.find((item) => item.tqlName === left);
  if (!field) return null;
  if (!field.operators.includes("between")) return null;
  const fromValue = parseScalar(from.trim(), field);
  const toValue = parseScalar(to.trim(), field);
  if (fromValue === undefined || toValue === undefined) return null;
  return {
    ok: true,
    node: { field: field.key, operator: "between", value: [fromValue, toValue] },
  };
}

function toOperator(raw: string): TqlOperator | null {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized === "==" || normalized === "=") return "eq";
  if (normalized === "!=") return "neq";
  if (normalized === "%") return "contains";
  if (normalized === ">") return "gt";
  if (normalized === "<") return "lt";
  if (normalized === ">=") return "gte";
  if (normalized === "<=") return "lte";
  if (normalized === "in") return "in";
  if (normalized === "not in") return "nin";
  return null;
}

function parseValue(raw: string, operator: TqlOperator): unknown {
  if (isMultiValue(operator)) {
    const match = /^\[([\s\S]*)\]$/.exec(raw);
    if (!match) return undefined;
    const inner = match[1].trim();
    if (!inner) return [];
    const items = splitList(inner).map((item) => item.trim());
    if (!items.every(isScalarLiteral)) return undefined;
    return items.map(unquote);
  }
  if (!isScalarLiteral(raw)) return undefined;
  return unquote(raw);
}

// The operator regex captures everything after the operator, so a typo like
// `test %% 'x'` or a trailing `and` would otherwise be read as a literal value
// and silently run a different query.
function isScalarLiteral(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  const quote = text[0];
  if (quote !== "'" && quote !== '"') return !/['"()[\],=<>!%]/.test(text);
  for (let i = 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === quote) return i === text.length - 1;
  }
  return false;
}

function parseScalar(raw: string, field: TqlField): unknown {
  const value = unquote(raw);
  if (field.kind === "number") {
    const num = Number(value);
    if (Number.isNaN(num)) return undefined;
    return num;
  }
  if (field.kind === "timestamp") {
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return undefined;
    return date;
  }
  return value;
}

function splitList(inner: string): string[] {
  const parts: string[] = [];
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    if (quote) {
      if (char === "\\") {
        i++;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char !== ",") continue;
    parts.push(inner.slice(start, i));
    start = i + 1;
  }
  parts.push(inner.slice(start));
  return parts.filter((part) => part.trim().length > 0);
}

function unquote(raw: string): string | number | boolean {
  const text = raw.trim();
  const match = /^(['"])([\s\S]*)\1$/.exec(text);
  if (match) return match[2].replace(/\\([\s\S])/g, "$1");
  if (text === "true") return true;
  if (text === "false") return false;
  const num = Number(text);
  if (text !== "" && !Number.isNaN(num)) return num;
  return text;
}

function checkOptions(value: unknown, field: TqlField): string | null {
  if (!field.options?.length) return null;
  if (field.kind === "string") return null;
  const allowed = new Set(field.options.map((option) => String(option.value)));
  const values = toArray(value);
  for (const item of values) {
    if (allowed.has(String(item))) continue;
    const list = Array.from(allowed).slice(0, 8).join(", ");
    return `"${item}" is not a valid ${field.label}. Allowed: ${list}`;
  }
  return null;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

export type Connector = "and" | "or";

export interface TqlCondition {
  field: string;
  operator: TqlOperator;
  value: unknown;
}

export interface TqlGroup {
  connector: Connector;
  children: TqlNode[];
}

export type TqlNode = TqlCondition | TqlGroup;

export interface TqlField {
  key: string;
  label: string;
  tqlName: string;
  kind: ColKind;
  filterType: "input" | "checkbox" | "slider" | "timerange";
  operators: TqlOperator[];
  options?: Option[];
}

export type TqlParseResult =
  | { ok: true; query: TqlGroup }
  | ParseError;

type ParseError = { ok: false; error: string; representable?: boolean };

type ParseGroupResult = { ok: true; node: TqlGroup } | ParseError;

type ParseNodeResult = { ok: true; node: TqlNode } | ParseError;

type SplitResult = {
  clauses: string[];
  connector: Connector;
  mixed: boolean;
  error?: string;
};
