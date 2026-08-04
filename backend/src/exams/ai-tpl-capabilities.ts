import { STRUCTURED_TPL_NAMES, type StructuredTplName } from './tpl-schemas';

export type AiTplCapability = Readonly<{
  template: StructuredTplName;
  answerEngineAvailable: boolean;
  materialComplete: boolean;
  rendererFixturePassed: boolean;
  aiGenerationEnabled: boolean;
}>;

export const AI_GENERATION_TEMPLATES = [
  'TPL_CASE_DIAGNOSTIC_FRAME',
  'TPL_CONVERSATIONAL_FLOW',
  'TPL_COMPARATIVE_MATRIX',
] as const satisfies readonly StructuredTplName[];

const ENABLED_TEMPLATES = new Set<StructuredTplName>(AI_GENERATION_TEMPLATES);

export const AI_TPL_CAPABILITIES: readonly AiTplCapability[] =
  STRUCTURED_TPL_NAMES.map((template) => ({
    template,
    answerEngineAvailable: ENABLED_TEMPLATES.has(template),
    materialComplete: ENABLED_TEMPLATES.has(template),
    rendererFixturePassed: ENABLED_TEMPLATES.has(template),
    aiGenerationEnabled: ENABLED_TEMPLATES.has(template),
  }));

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
