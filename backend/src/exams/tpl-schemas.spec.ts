import { STRUCTURED_TPL_NAMES, getTplSchema } from './tpl-schemas';

type JsonSchema = Readonly<Record<string, unknown>>;

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function expectStrictObjects(schema: JsonSchema, path: string): void {
  if (schema.type === 'object') {
    const properties = schema.properties;
    expect(isSchema(properties)).toBe(true);
    if (!isSchema(properties)) return;
    const required = schema.required;
    expect(Array.isArray(required)).toBe(true);
    if (!Array.isArray(required)) return;
    expect(schema.additionalProperties).toBe(false);
    expect([...required].sort()).toEqual(Object.keys(properties).sort());
    for (const [key, value] of Object.entries(properties)) {
      if (isSchema(value)) expectStrictObjects(value, `${path}.${key}`);
    }
  }
  if (isSchema(schema.items)) expectStrictObjects(schema.items, `${path}[]`);
}

describe('TPL_SCHEMA_MAP', () => {
  it('supplies a strict OpenAI-compatible object schema for every template', () => {
    for (const template of STRUCTURED_TPL_NAMES) {
      const definition = getTplSchema(template);
      expect(definition).not.toBeNull();
      if (definition !== null) expectStrictObjects(definition.schema, template);
    }
  });
});
