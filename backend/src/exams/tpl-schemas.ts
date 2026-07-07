export interface TplSchema {
  name: string;
  strict: boolean;
  schema: Record<string, unknown>;
}

const ALL_TPL_NAMES = [
  'TPL_COMPARATIVE_MATRIX', 'TPL_FORMAL_DOCUMENT', 'TPL_CONVERSATIONAL_FLOW',
  'TPL_CASE_DIAGNOSTIC_FRAME', 'TPL_SEQUENTIAL_WORKFLOW', 'TPL_INSTRUCTIONAL_SCENE',
  'TPL_DIGITAL_FORUM_INTERFACE', 'TPL_QUANTITATIVE_CHART', 'TPL_PROMOTIONAL_CANVAS',
];

function str(): Record<string, unknown> {
  return { type: 'string' };
}

function enumStr(values: string[]): Record<string, unknown> {
  return { type: 'string', enum: values };
}

function integer(min?: number, max?: number): Record<string, unknown> {
  const s: Record<string, unknown> = { type: 'integer' };
  if (min !== undefined) s.minimum = min;
  if (max !== undefined) s.maximum = max;
  return s;
}

function arr(items: Record<string, unknown>, min?: number): Record<string, unknown> {
  const s: Record<string, unknown> = { type: 'array', items };
  if (min !== undefined) s.minItems = min;
  return s;
}

function obj(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false };
}

const comboBlockSchema = obj({
  title: str(),
  items: arr(obj({
    key: enumStr(['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ']),
    text: str(),
  }, ['key', 'text'])),
}, ['title', 'items']);

const metadataSchema = obj({
  unit_name: str(),
  target_concept: str(),
  item_type: str(),
  difficulty: enumStr(['하', '중', '상', '극상', 'LOW', 'MIDDLE', 'HIGH', 'SUPER', 'INTERGRATE']),
  recommended_template: enumStr(ALL_TPL_NAMES),
  point_value: integer(1, 3),
}, ['unit_name', 'target_concept', 'item_type', 'difficulty', 'recommended_template', 'point_value']);

const explanationSchema = obj({
  judgment: str(),
  distractors: obj({
    '2': str(),
    '3': str(),
    '4': str(),
    '5': str(),
  }, ['2', '3', '4', '5']),
}, ['judgment', 'distractors']);

const baseRenderReady = {
  question_stem: str(),
  options_list: arr(str(), 5),
  combo_block: { ...comboBlockSchema },
};

function renderReady(extraProperties: Record<string, unknown>): Record<string, unknown> {
  return obj({
    ...baseRenderReady,
    ...extraProperties,
  }, ['question_stem', 'options_list']);
}

const baseItem = {
  metadata: metadataSchema,
  correct_answer: integer(1, 5),
  explanation: explanationSchema,
};

function itemSchema(renderReadyProps: Record<string, unknown>, renderRequired?: string[]): Record<string, unknown> {
  return obj({
    ...baseItem,
    render_ready: renderReady(renderReadyProps),
  }, ['metadata', 'render_ready', 'correct_answer', 'explanation']);
}

const matrixStimulus = obj({
  headers: arr(obj({ id: str(), label: str() }, ['id', 'label']), 1),
  rows: arr(obj({
    id: str(),
    cells: arr(str(), 1),
  }, ['id', 'cells']), 1),
  selection_chips: arr(str()),
}, ['headers', 'rows', 'selection_chips']);

const formalDocStimulus = obj({
  doc_type: str(),
  header_info: obj({ title: str(), date: str(), author: str() }, ['title', 'date', 'author']),
  paragraphs: arr(obj({ sub_title: str(), content: str() }, ['sub_title', 'content']), 1),
  footnotes: arr(str()),
}, ['doc_type', 'header_info', 'paragraphs']);

const convFlowStimulus = obj({
  participants: arr(obj({ id: str(), name: str(), role: str() }, ['id', 'name', 'role']), 1),
  messages: arr(obj({ p_id: str(), text: str(), timestamp: str() }, ['p_id', 'text', 'timestamp']), 1),
}, ['participants', 'messages']);

const caseDiagStimulus = obj({
  case_profile: obj({ name: str(), context: str() }, ['name', 'context']),
  narrative: str(),
  check_items: arr(obj({ id: str(), label: str(), is_checked: { type: 'boolean' } }, ['id', 'label', 'is_checked'])),
}, ['case_profile', 'narrative']);

const seqWorkflowStimulus = obj({
  orientation: { type: 'string', enum: ['horizontal', 'vertical'] },
  steps: arr(obj({
    idx: integer(0),
    label: str(),
    desc: str(),
    is_missing: { type: 'boolean' },
  }, ['idx', 'label', 'desc', 'is_missing']), 1),
}, ['orientation', 'steps']);

const instructionalSceneStimulus = obj({
  instructor: obj({ id: str(), text: str() }, ['id', 'text']),
  canvas_content: obj({
    type: { type: 'string', enum: ['text', 'table', 'image', 'mind_map', 'key_map'] },
    data: str(),
  }, ['type', 'data']),
  students: arr(obj({ id: str(), text: str() }, ['id', 'text'])),
}, ['instructor', 'canvas_content']);

const forumStimulus = obj({
  forum_name: str(),
  main_post: obj({ author: str(), title: str(), content: str() }, ['author', 'title', 'content']),
  comments: arr(obj({ author: str(), text: str() }, ['author', 'text'])),
}, ['forum_name', 'main_post']);

const quantChartStimulus = obj({
  chart_type: { type: 'string', enum: ['radar', 'bar', 'line'] },
  axes: arr(obj({ key: str(), label: str(), max: integer() }, ['key', 'label', 'max']), 1),
  datasets: arr(obj({ label: str(), values: arr(integer()) }, ['label', 'values']), 1),
}, ['chart_type', 'axes', 'datasets']);

const promoCanvasStimulus = obj({
  slogan: str(),
  bullets: arr(str(), 1),
  visual_elements: arr(str()),
  missing_part: str(),
}, ['slogan', 'bullets', 'visual_elements']);

export const TPL_SCHEMA_MAP: Record<string, TplSchema> = {
  TPL_COMPARATIVE_MATRIX: {
    name: 'comparative_matrix_item',
    strict: true,
    schema: itemSchema({ stimulus_data: matrixStimulus }),
  },
  TPL_FORMAL_DOCUMENT: {
    name: 'formal_document_item',
    strict: true,
    schema: itemSchema({ stimulus_data: formalDocStimulus }),
  },
  TPL_CONVERSATIONAL_FLOW: {
    name: 'conversational_flow_item',
    strict: true,
    schema: itemSchema({ stimulus_data: convFlowStimulus }),
  },
  TPL_CASE_DIAGNOSTIC_FRAME: {
    name: 'case_diagnostic_frame_item',
    strict: true,
    schema: itemSchema({ stimulus_data: caseDiagStimulus }),
  },
  TPL_SEQUENTIAL_WORKFLOW: {
    name: 'sequential_workflow_item',
    strict: true,
    schema: itemSchema({ stimulus_data: seqWorkflowStimulus }),
  },
  TPL_INSTRUCTIONAL_SCENE: {
    name: 'instructional_scene_item',
    strict: true,
    schema: itemSchema({ stimulus_data: instructionalSceneStimulus }),
  },
  TPL_DIGITAL_FORUM_INTERFACE: {
    name: 'digital_forum_interface_item',
    strict: true,
    schema: itemSchema({ stimulus_data: forumStimulus }),
  },
  TPL_QUANTITATIVE_CHART: {
    name: 'quantitative_chart_item',
    strict: true,
    schema: itemSchema({ stimulus_data: quantChartStimulus }),
  },
  TPL_PROMOTIONAL_CANVAS: {
    name: 'promotional_canvas_item',
    strict: true,
    schema: itemSchema({ stimulus_data: promoCanvasStimulus }),
  },
};

export function getTplSchema(template: string): TplSchema | null {
  return TPL_SCHEMA_MAP[template] ?? null;
}
