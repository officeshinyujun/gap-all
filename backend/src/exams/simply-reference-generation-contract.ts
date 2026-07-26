import { StimulusNormalizer } from './stimulus-normalizer';
import { isStructuredTplName, type StructuredTplName } from './tpl-schemas';

const normalizer = new StimulusNormalizer();

export function validateSimplyReferenceStructuredTpl(
  template: unknown,
  stimulusData: unknown,
): boolean {
  if (!isStructuredTplName(template) || !isRecord(stimulusData)) return false;
  return (
    normalizer.isRenderableTplData(stimulusData, template) &&
    meetsWebRendererContract(template, stimulusData) &&
    meetsPdfRendererContract(template, stimulusData)
  );
}

function meetsWebRendererContract(
  template: StructuredTplName,
  data: Record<string, unknown>,
): boolean {
  switch (template) {
    case 'TPL_COMPARATIVE_MATRIX':
      return nonEmptyArray(data.headers) && nonEmptyArray(data.rows);
    case 'TPL_FORMAL_DOCUMENT':
      return nonEmptyArray(data.paragraphs);
    case 'TPL_CONVERSATIONAL_FLOW':
      return nonEmptyArray(data.messages);
    case 'TPL_CASE_DIAGNOSTIC_FRAME':
      return isRecord(data.case_profile) && nonEmptyText(data.narrative);
    case 'TPL_SEQUENTIAL_WORKFLOW':
      return nonEmptyArray(data.steps);
    case 'TPL_INSTRUCTIONAL_SCENE':
      return isRecord(data.instructor) && isRecord(data.canvas_content);
    case 'TPL_DIGITAL_FORUM_INTERFACE':
      return isRecord(data.main_post) && nonEmptyText(data.forum_name);
    case 'TPL_QUANTITATIVE_CHART':
      return nonEmptyArray(data.axes) && nonEmptyArray(data.datasets);
    case 'TPL_PROMOTIONAL_CANVAS':
      return nonEmptyText(data.slogan) || nonEmptyArray(data.bullets);
    case 'TPL_ARTICLE':
      return nonEmptyArray(data.body_paragraphs);
    case 'TPL_STATISTICS':
      return nonEmptyArray(data.data_entries);
    case 'TPL_INCIDENT_REPORT':
      return nonEmptyText(data.overview) && nonEmptyText(data.cause);
    case 'TPL_ANNOUNCEMENT':
      return nonEmptyText(data.title) && nonEmptyArray(data.details);
    case 'TPL_REPORT':
      return nonEmptyArray(data.sections);
  }
}

function meetsPdfRendererContract(
  template: StructuredTplName,
  data: Record<string, unknown>,
): boolean {
  switch (template) {
    case 'TPL_COMPARATIVE_MATRIX':
    case 'TPL_SEQUENTIAL_WORKFLOW':
    case 'TPL_QUANTITATIVE_CHART':
      return meetsWebRendererContract(template, data);
    case 'TPL_FORMAL_DOCUMENT':
    case 'TPL_CONVERSATIONAL_FLOW':
    case 'TPL_CASE_DIAGNOSTIC_FRAME':
    case 'TPL_INSTRUCTIONAL_SCENE':
    case 'TPL_DIGITAL_FORUM_INTERFACE':
    case 'TPL_PROMOTIONAL_CANVAS':
    case 'TPL_ARTICLE':
    case 'TPL_STATISTICS':
    case 'TPL_INCIDENT_REPORT':
    case 'TPL_ANNOUNCEMENT':
    case 'TPL_REPORT':
      return true;
  }
}

function nonEmptyArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
