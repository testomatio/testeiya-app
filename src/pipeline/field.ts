import { Duration } from "./duration.js";
import type { Dialect } from "./variables.js";

export type Raw = Record<string, unknown>;
/** Where a value sits in the pipeline: `["stages", 2, "when"]`. */
export type Path = Array<string | number>;
/** `append_key`, `prepend_key` and `remove_key` in an override. */
export type Op = "append" | "prepend" | "remove";

const OPS: Op[] = ["append", "prepend", "remove"];

/** The mapping a field sits in: `stage "plan"` at `["stages", 2]`. */
export interface Spot {
  /** Names the mapping in a message. Empty for the pipeline itself. */
  where: string;
  path: Path;
}

export interface Scope extends Spot {
  fail(message: string, at?: Path): never;
  /** Names the mapping when a key of it is unknown. Default: `where`. */
  named?: string;
}

/** Text in a pipeline that reads variables. */
export interface SpecText {
  text: string;
  expands: Dialect;
  /** The key that holds it: `task`, `run`, `env`. */
  use: string;
  /** Names it in a message: `stage "plan" task`, or `env.` and the entry's name. */
  what: string;
  at: Path;
  /** The entry's name, when the text is a value of a map. */
  key?: string;
}

interface Expanding {
  /** Who expands the variables in it. Without it, nothing does. */
  expands?: Dialect;
}

/**
 * One key of a pipeline file, and everything known about it: how its value is
 * checked, what an override does to it, and whether it reads variables.
 * `spec.ts` lists every key once, as one of these.
 */
export abstract class Field<T = unknown> {
  /** The checked value. `undefined` leaves the key out of the spec. */
  abstract read(value: unknown, key: string, scope: Scope): T;

  /** The raw value after an override. A plain key replaces, and that is all most fields take. */
  merge(_current: unknown, value: unknown, op: Op | undefined, key: string, scope: Scope): unknown {
    if (op) return this.refuse(op, key, scope);
    return value;
  }

  /** The texts in a checked value that read variables. */
  texts(_value: T, _key: string, _spot: Spot): SpecText[] {
    return [];
  }

  protected what(key: string, spot: Spot): string {
    return spot.where ? `${spot.where} ${key}` : key;
  }

  protected refuse(op: Op, key: string, scope: Scope): never {
    return scope.fail(`${scope.where}: ${op}_${key} is not allowed, set ${key} instead`);
  }

  static isRecord(value: unknown): value is Raw {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  // A single value is a list of one, so `stopOn: fail` and `when: staging` read naturally.
  static list(value: unknown): unknown[] {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }
}

/** Free text. An override appends or prepends a line. */
export class Text extends Field<string | undefined> {
  constructor(private readonly options: Expanding = {}) {
    super();
  }

  read(value: unknown, key: string, scope: Scope): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") return scope.fail(`${this.what(key, scope)} must be text`, [...scope.path, key]);
    return value;
  }

  merge(current: unknown, value: unknown, op: Op | undefined, key: string, scope: Scope): unknown {
    if (!op) return value;
    if (op === "remove") return this.refuse(op, key, scope);
    if (typeof value !== "string") return scope.fail(`${scope.where}: ${op}_${key} must be text`);
    if (typeof current !== "string" || !current.trim()) return value;
    if (op === "prepend") return `${value.trimEnd()}\n${current}`;
    return `${current.trimEnd()}\n${value}`;
  }

  texts(value: string | undefined, key: string, spot: Spot): SpecText[] {
    const { expands } = this.options;
    if (!value || !expands) return [];
    return [{ text: value, expands, use: key, what: this.what(key, spot), at: [...spot.path, key] }];
  }
}

interface ListOptions<I extends string> extends Expanding {
  /** The only items it takes. */
  oneOf?: readonly I[];
}

/** A list of text. An override appends, prepends or removes items. */
abstract class Items<I extends string, T extends I[] | undefined> extends Field<T> {
  constructor(private readonly options: ListOptions<I> = {}) {
    super();
  }

  /** What the spec holds when the file does not set the key. */
  protected abstract absent(): T;

  read(value: unknown, key: string, scope: Scope): T {
    if (value === undefined || value === null) return this.absent();
    const what = this.what(key, scope);
    const at = [...scope.path, key];
    const items = typeof value === "string" ? [value] : value;
    if (!Array.isArray(items) || items.some((item) => typeof item !== "string")) return scope.fail(`${what} must be a list of text`, at);
    const { oneOf } = this.options;
    for (const item of items) {
      if (oneOf && !oneOf.includes(item)) scope.fail(`${what} takes ${oneOf.join(" or ")}, got "${item}"`, at);
    }
    return items as T;
  }

  merge(current: unknown, value: unknown, op: Op | undefined): unknown {
    if (!op) return value;
    const items = Field.list(value);
    const list = Field.list(current);
    if (op === "append") return [...list, ...items];
    if (op === "prepend") return [...items, ...list];
    return list.filter((item) => !items.includes(item));
  }

  texts(value: T, key: string, spot: Spot): SpecText[] {
    const { expands } = this.options;
    if (!value || !expands) return [];
    return value.map((text) => ({ text, expands, use: key, what: this.what(key, spot), at: [...spot.path, key] }));
  }
}

/** A list that is empty when the file does not set it. */
export class List<I extends string = string> extends Items<I, I[]> {
  protected absent(): I[] {
    return [];
  }
}

/** A list that stays out of the spec when the file does not set it. */
export class OptionalList<I extends string = string> extends Items<I, I[] | undefined> {
  protected absent(): undefined {
    return undefined;
  }
}

/** A map of name to text. An override merges by name, or removes names. */
export class Dictionary extends Field<Record<string, string>> {
  constructor(private readonly options: Expanding = {}) {
    super();
  }

  read(value: unknown, key: string, scope: Scope): Record<string, string> {
    if (value === undefined || value === null) return {};
    const what = this.what(key, scope);
    if (!Field.isRecord(value)) return scope.fail(`${what} must be a mapping`, [...scope.path, key]);
    const map: Record<string, string> = {};
    for (const [name, item] of Object.entries(value)) {
      if (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean") {
        scope.fail(`${what}.${name} must be text`, [...scope.path, key, name]);
      }
      map[name] = String(item);
    }
    return map;
  }

  merge(current: unknown, value: unknown, op: Op | undefined, key: string, scope: Scope): unknown {
    if (!op) {
      if (Field.isRecord(current) && Field.isRecord(value)) return { ...current, ...value };
      return value;
    }
    if (op !== "remove") return this.refuse(op, key, scope);
    const map = { ...(Field.isRecord(current) ? current : {}) };
    for (const name of Field.list(value).map(String)) delete map[name];
    return map;
  }

  texts(value: Record<string, string>, key: string, spot: Spot): SpecText[] {
    const { expands } = this.options;
    if (!expands) return [];
    const what = this.what(key, spot);
    return Object.entries(value).map(([name, text]) => ({ text, expands, use: key, what: `${what}.${name}`, at: [...spot.path, key, name], key: name }));
  }
}

/** `true` or `false`. */
export class Flag extends Field<boolean | undefined> {
  read(value: unknown, key: string, scope: Scope): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") return scope.fail(`${this.what(key, scope)} must be true or false`, [...scope.path, key]);
    return value;
  }
}

/** A name of lowercase words joined by dashes: a stage's id, a session. */
export class Slug extends Field<string | undefined> {
  static is(value: unknown): value is string {
    if (typeof value !== "string") return false;
    if (!value || value.startsWith("-") || value.endsWith("-") || value.includes("--")) return false;
    return [...value].every((char) => (char >= "a" && char <= "z") || (char >= "0" && char <= "9") || char === "-");
  }

  read(value: unknown, key: string, scope: Scope): string | undefined {
    if (value === undefined) return undefined;
    const what = this.what(key, scope);
    if (value !== null && typeof value !== "string") return scope.fail(`${what} must be text`, [...scope.path, key]);
    if (!Slug.is(value)) return scope.fail(`${what} must be lowercase words joined by dashes`, [...scope.path, key]);
    return value;
  }
}

/** "90s", "30m", "1h", or seconds. */
export class Timeout extends Field<string | number | undefined> {
  read(value: unknown, key: string, scope: Scope): string | number | undefined {
    if (value === undefined) return undefined;
    if (!Duration.ms(value)) return scope.fail(`${this.what(key, scope)} must look like 90s, 30m or 1h`, [...scope.path, key]);
    return value as string | number;
  }
}

/** A whole number above 0. */
export class Whole extends Field<number | undefined> {
  read(value: unknown, key: string, scope: Scope): number | undefined {
    if (value === undefined) return undefined;
    if (!Number.isInteger(value) || (value as number) < 1) {
      return scope.fail(`${this.what(key, scope)} must be a whole number above 0`, [...scope.path, key]);
    }
    return value as number;
  }
}

type Fields = Record<string, Field>;

/** What `Shape.read` returns: every key with the value its field reads. */
export type Values<F extends Fields> = { [K in keyof F]: F[K] extends Field<infer T> ? T : never };

/** A mapping inside a mapping, like a prerequisite's `changes`. An override changes it key by key. */
export class Group<F extends Fields> extends Field<Values<F> | undefined> {
  constructor(private readonly shape: Shape<F>) {
    super();
  }

  read(value: unknown, key: string, scope: Scope): Values<F> | undefined {
    if (value === undefined) return undefined;
    const what = this.what(key, scope);
    const path = [...scope.path, key];
    if (!Field.isRecord(value)) return scope.fail(`${what} must be a mapping`, path);
    return this.shape.read(value, { ...scope, path, named: what });
  }

  merge(current: unknown, value: unknown, op: Op | undefined, key: string, scope: Scope): unknown {
    if (op) return this.refuse(op, key, scope);
    if (!Field.isRecord(value)) return scope.fail(`${scope.where}: ${key} must be a mapping`);
    return this.shape.merge(Field.isRecord(current) ? current : {}, value, { ...scope, where: `${scope.where} ${key}` });
  }

  texts(value: Values<F> | undefined, key: string, spot: Spot): SpecText[] {
    if (!value) return [];
    return this.shape.texts(value, { where: spot.where, path: [...spot.path, key] });
  }
}

/**
 * A list of mappings with an `id`, like `stages`. `read` checks the list and
 * leaves each item to the caller. An override changes an item by its id.
 */
export class Each<F extends Fields> extends Field<unknown[]> {
  constructor(
    private readonly shape: Shape<F>,
    /** Names one item in a message: `stage`. */
    private readonly noun: string,
    /** A change to an unknown id is a new item when it sets one of these keys. */
    private readonly whole: string[],
  ) {
    super();
  }

  read(value: unknown, key: string, scope: Scope): unknown[] {
    if (!Array.isArray(value) || value.length === 0) return scope.fail(`${this.what(key, scope)} must be a non-empty list`, [...scope.path, key]);
    return value;
  }

  merge(current: unknown, value: unknown, op: Op | undefined, key: string, scope: Scope): unknown {
    const { noun } = this;
    // An item that is not a mapping stays as it is, for validation to report.
    const items: unknown[] = [...(Array.isArray(current) ? current : [])];
    const idOf = (item: unknown) => (Field.isRecord(item) ? item.id : undefined);
    if (op === "remove") {
      const ids = Field.list(value);
      for (const id of ids) {
        if (!items.some((item) => idOf(item) === id)) scope.fail(`there is no ${noun} "${id}" to remove`);
      }
      return items.filter((item) => !ids.includes(idOf(item)));
    }
    if (op) return scope.fail(`${key} take changes by id or remove_${key}, not ${op}_${key}`);
    if (!Array.isArray(value)) return scope.fail(`${key} must be a list of ${key} with an id`);
    for (const change of value as unknown[]) {
      if (!Field.isRecord(change) || typeof change.id !== "string") return scope.fail(`every ${noun} needs an id`);
      const index = items.findIndex((item) => idOf(item) === change.id);
      if (index >= 0) {
        items[index] = this.shape.merge(items[index] as Raw, change, { ...scope, where: `${noun} "${change.id}"` });
        continue;
      }
      if (!this.whole.some((name) => change[name] !== undefined)) scope.fail(`there is no ${noun} "${change.id}" to change`);
      items.push(change);
    }
    return items;
  }

  texts(value: unknown[], key: string, spot: Spot): SpecText[] {
    return value.flatMap((item, index) => {
      const id = (item as { id: string }).id;
      return this.shape.texts(item as Values<F>, { where: `${this.noun} "${id}"`, path: [...spot.path, key, index] });
    });
  }
}

/**
 * A map of name to mapping, like `prerequisites`. `read` checks the map and
 * leaves each item to the caller. An override changes an item by its name.
 */
export class Named<F extends Fields> extends Field<Raw> {
  constructor(
    private readonly shape: Shape<F>,
    /** Names one item in a message: `prerequisite`. */
    private readonly noun: string,
  ) {
    super();
  }

  read(value: unknown, key: string, scope: Scope): Raw {
    if (value === undefined || value === null) return {};
    if (!Field.isRecord(value)) return scope.fail(`${this.what(key, scope)} must be a mapping of name to checks`, [...scope.path, key]);
    return value;
  }

  merge(current: unknown, value: unknown, op: Op | undefined, key: string, scope: Scope): unknown {
    const { noun } = this;
    const items: Raw = { ...(Field.isRecord(current) ? current : {}) };
    if (op === "remove") {
      for (const name of Field.list(value).map(String)) {
        if (!(name in items)) scope.fail(`there is no ${noun} "${name}" to remove`);
        delete items[name];
      }
      return items;
    }
    if (op) return scope.fail(`${key} take changes by name or remove_${key}, not ${op}_${key}`);
    if (!Field.isRecord(value)) return scope.fail(`${key} must be a mapping of name to checks`);
    for (const [name, change] of Object.entries(value)) {
      if (!Field.isRecord(change)) return scope.fail(`${noun} "${name}" must be a mapping`);
      const item = items[name];
      items[name] = this.shape.merge(Field.isRecord(item) ? item : {}, change, { ...scope, where: `${noun} "${name}"` });
    }
    return items;
  }

  texts(value: Raw, key: string, spot: Spot): SpecText[] {
    return Object.entries(value).flatMap(([name, item]) => {
      return this.shape.texts(item as Values<F>, { where: `${this.noun} "${name}"`, path: [...spot.path, key, name] });
    });
  }
}

/** The keys of one mapping of a pipeline file, each with its field. */
export class Shape<F extends Fields> {
  constructor(readonly fields: F) {}

  /** Checks every key. A key the file leaves out, and whose field has no default, is left out. */
  read(raw: Raw, scope: Scope): Values<F> {
    for (const key of Object.keys(raw)) {
      if (!this.field(key)) scope.fail(`${scope.named ?? scope.where} has an unknown key "${key}"`, [...scope.path, key]);
    }
    const values: Raw = {};
    for (const [key, field] of Object.entries(this.fields)) {
      const value = field.read(raw[key], key, scope);
      if (value !== undefined) values[key] = value;
    }
    return values as Values<F>;
  }

  /** `base` with an override's keys laid over it. Nothing is checked but the override's own form. */
  merge(base: Raw, change: Raw, scope: Scope): Raw {
    const result = { ...base };
    for (const [key, value] of Object.entries(change)) {
      const op = OPS.find((name) => key.startsWith(`${name}_`));
      const name = op ? key.slice(op.length + 1) : key;
      const field = this.field(name);
      if (field) result[name] = field.merge(result[name], value, op, name, scope);
      // A plain unknown key stays, for validation to report with its line.
      else if (op) scope.fail(`${scope.where} has an unknown key "${key}"`);
      else result[key] = value;
    }
    return result;
  }

  /** Every text in checked values that reads variables, in the order of the keys. */
  texts(values: Partial<Values<F>>, spot: Spot = { where: "", path: [] }): SpecText[] {
    return Object.entries(this.fields).flatMap(([key, field]) => {
      const value = (values as Raw)[key];
      if (value === undefined) return [];
      return field.texts(value, key, spot);
    });
  }

  private field(key: string): Field | undefined {
    if (!Object.hasOwn(this.fields, key)) return undefined;
    return this.fields[key];
  }
}
