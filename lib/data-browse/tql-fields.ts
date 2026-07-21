import { generateFilterFields, type TableSchemaDefinition } from "@/lib/table-schema";
import { operatorsForKind, type TqlField } from "./tql";

export function generateTqlFields(
  schema: TableSchemaDefinition,
): TqlField[] {
  const filterFields = generateFilterFields(schema);
  const result: TqlField[] = [];

  for (const [key, builder] of Object.entries(schema)) {
    const config = builder._config;
    if (!config.filter) continue;
    if (!config.tql) continue;

    const field = filterFields.find((item) => item.value === key);
    if (!field) continue;

    const operators = operatorsForKind(config.kind, config.tql.operators);
    if (!operators.length) continue;

    result.push({
      key,
      label: config.label,
      tqlName: config.tql.field,
      kind: config.kind,
      filterType: config.filter.type,
      operators,
      options: "options" in field ? field.options : undefined,
    });
  }

  return result;
}
