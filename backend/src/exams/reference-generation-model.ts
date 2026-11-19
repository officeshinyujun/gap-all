export const DEFAULT_REFERENCE_GENERATION_MODEL = 'gpt-4o-mini';
export const DEFAULT_REFERENCE_FINAL_GENERATION_MODEL = 'gpt-4o';

export function referenceGenerationModel(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = environment.OPENAI_REFERENCE_MODEL?.trim();
  return configured === undefined || configured === ''
    ? DEFAULT_REFERENCE_GENERATION_MODEL
    : configured;
}

export function referenceFinalGenerationModel(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const configured = environment.OPENAI_REFERENCE_FINAL_MODEL?.trim();
  return configured === undefined || configured === ''
    ? DEFAULT_REFERENCE_FINAL_GENERATION_MODEL
    : configured;
}
