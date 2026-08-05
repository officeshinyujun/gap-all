import { STRUCTURED_TPL_NAMES, type StructuredTplName } from './tpl-schemas';

export type AiTplCapability = Readonly<{
  template: StructuredTplName;
  answerEngineAvailable: boolean;
  materialComplete: boolean;
  rendererFixturePassed: boolean;
  aiGenerationEnabled: boolean;
}>;

export type ProviderSlotField =
  | 'messageTexts'
  | 'cellTexts'
  | 'paragraphTexts'
  | 'detailTexts'
  | 'stepTexts'
  | 'forumTexts'
  | 'sceneTexts'
  | 'promotionTexts'
  | 'incidentTexts'
  | 'reportTexts'
  | 'numericTexts';

export type TplGenerationSpec = Readonly<{
  template: StructuredTplName;
  providerSlotField?: ProviderSlotField;
  enabled: boolean;
  answerEngineAvailable: boolean;
  materialComplete: boolean;
  rendererFixturePassed: boolean;
}>;

export const TPL_GENERATION_REGISTRY: readonly TplGenerationSpec[] = [
  { template: 'TPL_CASE_DIAGNOSTIC_FRAME', enabled: true, answerEngineAvailable: true, materialComplete: true, rendererFixturePassed: true },
  { template: 'TPL_CONVERSATIONAL_FLOW', providerSlotField: 'messageTexts', enabled: true, answerEngineAvailable: true, materialComplete: true, rendererFixturePassed: true },
  { template: 'TPL_COMPARATIVE_MATRIX', providerSlotField: 'cellTexts', enabled: true, answerEngineAvailable: true, materialComplete: true, rendererFixturePassed: true },
  { template: 'TPL_FORMAL_DOCUMENT', providerSlotField: 'paragraphTexts', enabled: true, answerEngineAvailable: true, materialComplete: true, rendererFixturePassed: true },
  { template: 'TPL_ARTICLE', providerSlotField: 'paragraphTexts', enabled: true, answerEngineAvailable: true, materialComplete: true, rendererFixturePassed: true },
  { template: 'TPL_ANNOUNCEMENT', providerSlotField: 'detailTexts', enabled: true, answerEngineAvailable: true, materialComplete: true, rendererFixturePassed: true },
  { template: 'TPL_SEQUENTIAL_WORKFLOW', providerSlotField: 'stepTexts', enabled: true, answerEngineAvailable: true, materialComplete: true, rendererFixturePassed: true },
  { template: 'TPL_DIGITAL_FORUM_INTERFACE', providerSlotField: 'forumTexts', enabled: false, answerEngineAvailable: false, materialComplete: false, rendererFixturePassed: false },
  { template: 'TPL_INSTRUCTIONAL_SCENE', providerSlotField: 'sceneTexts', enabled: false, answerEngineAvailable: false, materialComplete: false, rendererFixturePassed: false },
  { template: 'TPL_PROMOTIONAL_CANVAS', providerSlotField: 'promotionTexts', enabled: false, answerEngineAvailable: false, materialComplete: false, rendererFixturePassed: false },
  { template: 'TPL_INCIDENT_REPORT', providerSlotField: 'incidentTexts', enabled: false, answerEngineAvailable: false, materialComplete: false, rendererFixturePassed: false },
  { template: 'TPL_REPORT', providerSlotField: 'reportTexts', enabled: false, answerEngineAvailable: false, materialComplete: false, rendererFixturePassed: false },
  { template: 'TPL_QUANTITATIVE_CHART', providerSlotField: 'numericTexts', enabled: false, answerEngineAvailable: false, materialComplete: false, rendererFixturePassed: false },
  { template: 'TPL_STATISTICS', providerSlotField: 'numericTexts', enabled: false, answerEngineAvailable: false, materialComplete: false, rendererFixturePassed: false },
] as const;

export const AI_GENERATION_TEMPLATES = TPL_GENERATION_REGISTRY
  .filter((spec) => spec.enabled)
  .map((spec) => spec.template) as readonly StructuredTplName[];

const ENABLED_TEMPLATES = new Set<StructuredTplName>(AI_GENERATION_TEMPLATES);

export const AI_TPL_CAPABILITIES: readonly AiTplCapability[] =
  TPL_GENERATION_REGISTRY.map((spec) => ({
    template: spec.template,
    answerEngineAvailable: spec.answerEngineAvailable,
    materialComplete: spec.materialComplete,
    rendererFixturePassed: spec.rendererFixturePassed,
    aiGenerationEnabled: spec.enabled,
  }));

export function getTplGenerationSpec(template: string): TplGenerationSpec | undefined {
  return TPL_GENERATION_REGISTRY.find((spec) => spec.template === template);
}

export function canGenerateAiTemplate(
  template: string,
  source: string | undefined,
): template is StructuredTplName {
  const capability = AI_TPL_CAPABILITIES.find((item) => item.template === template);
  if (
    capability === undefined ||
    !capability.answerEngineAvailable ||
    !capability.materialComplete ||
    !capability.rendererFixturePassed ||
    !capability.aiGenerationEnabled
  ) {
    return false;
  }
  // ponytail: require a non-empty certified source until per-TPL fixtures exist.
  return typeof source === 'string' && source.trim().length > 0;
}
