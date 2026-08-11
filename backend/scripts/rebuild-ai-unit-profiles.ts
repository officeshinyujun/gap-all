import 'dotenv/config';
import { DataSource, In, Between } from 'typeorm';
import { ReferenceQuestion } from '../src/entities/reference-question.entity';
import { UnitExamProfile } from '../src/entities/unit-exam-profile.entity';
import {
  buildGenerationProfile,
  AI_UNIT_PROFILE_VERSION,
  AiUnitProfileService,
} from '../src/exams/ai-unit-profile.service';
import { TextbookService } from '../src/textbook/textbook.service';

type OutputFormat = 'json' | 'markdown';
type DatabaseTarget = 'supabase' | 'local';

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  process.env.DB_PROVIDER = 'local';
  const dataSource = new DataSource({
    type: 'postgres',
    url: requiredDatabaseUrl(options.database),
    entities: [ReferenceQuestion, UnitExamProfile],
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    const referenceRepo = dataSource.getRepository(ReferenceQuestion);
    const profileRepo = dataSource.getRepository(UnitExamProfile);
    const sources = await referenceRepo.find({
      where: {
        subject: In(catalogSubjects(options.subjectSlug)),
        unitNumber: Between(options.startUnitNum, options.endUnitNum),
      },
    });
    const textbookService = new TextbookService(undefined, dataSource);
    const concepts = await textbookService.getConcepts(
      options.subjectSlug,
      options.startUnitNum,
      options.endUnitNum,
    );
    const profile = options.write
      ? await new AiUnitProfileService(
          referenceRepo,
          profileRepo,
          textbookService,
        ).getProfile(
          options.subjectSlug,
          options.startUnitNum,
          options.endUnitNum,
        )
      : buildGenerationProfile(
          options.subjectSlug,
          options.startUnitNum,
          options.endUnitNum,
          concepts,
          sources,
        );
    const persisted = await profileRepo.find({
      where: {
        subjectSlug: options.subjectSlug,
        unitNumber: Between(options.startUnitNum, options.endUnitNum),
      },
    });
    const reconciliation = reconcile(profile, persisted);
    process.stdout.write(render(profile, options.format, reconciliation));
    process.stdout.write('\n');
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

function parseOptions(arguments_: readonly string[]): Readonly<{
  subjectSlug: string;
  startUnitNum: number;
  endUnitNum: number;
  format: OutputFormat;
  write: boolean;
  database: DatabaseTarget;
}> {
  const subjectSlug = valueOf(arguments_, '--subject') ?? 'success';
  const startUnitNum = integerValue(arguments_, '--start', 1);
  const endUnitNum = integerValue(arguments_, '--end', startUnitNum);
  const format = valueOf(arguments_, '--format') ?? 'markdown';
  const write = arguments_.includes('--write');
  const database = valueOf(arguments_, '--database') ?? 'supabase';
  if (database !== 'supabase' && database !== 'local') {
    throw new Error('Usage: rebuild:ai-unit-profiles --database=supabase|local');
  }
  if (format !== 'json' && format !== 'markdown') {
    throw new Error('Usage: rebuild:ai-unit-profiles --format=json|markdown');
  }
  if (startUnitNum < 1 || endUnitNum < startUnitNum) {
    throw new Error('Invalid unit range.');
  }
  return {
    subjectSlug,
    startUnitNum,
    endUnitNum,
    format: format === 'json' ? 'json' : 'markdown',
    write,
    database,
  };
}

function render(
  profile: ReturnType<typeof buildGenerationProfile>,
  format: OutputFormat,
  reconciliation: ReconciliationReport,
): string {
  if (format === 'json') {
    return JSON.stringify({ profile, reconciliation }, null, 2);
  }
  const lines = [
    `# AI unit profile (${AI_UNIT_PROFILE_VERSION})`,
    `subject: ${profile.subjectSlug}`,
    `reconciliation: ${reconciliation.status}`,
    ...reconciliation.mismatches.map((item) => `- mismatch: ${item}`),
    '',
  ];
  for (const unit of profile.units) {
    lines.push(
      `## ${unit.unitName}`,
      `- references: ${unit.referenceCount}`,
      `- certified: ${unit.certifiedReferenceCount}`,
      `- supported families: ${unit.supportedFamilies.join(', ') || 'none'}`,
      `- blocked: ${unit.blockedReasons.join(', ') || 'none'}`,
      `- concepts: ${unit.concepts.map((concept) => concept.name).join(', ') || 'none'}`,
      '',
    );
  }
  return lines.join('\n').trimEnd();
}

type ReconciliationReport = Readonly<{
  status: 'MATCH' | 'MISMATCH';
  mismatches: readonly string[];
}>;

function reconcile(
  profile: ReturnType<typeof buildGenerationProfile>,
  persisted: readonly UnitExamProfile[],
): ReconciliationReport {
  const rows = new Map(persisted.map((row) => [row.unitNumber, row]));
  const mismatches: string[] = [];
  for (const unit of profile.units) {
    const row = rows.get(unit.unitNumber);
    if (row === undefined) {
      mismatches.push(`${unit.unitNumber}:missing-persisted-row`);
      continue;
    }
    if (row.profileVersion !== AI_UNIT_PROFILE_VERSION) {
      mismatches.push(
        `${unit.unitNumber}:profile-version(${row.profileVersion}!=${AI_UNIT_PROFILE_VERSION})`,
      );
    }
    if (JSON.stringify(row.profile) !== JSON.stringify(unit)) {
      mismatches.push(`${unit.unitNumber}:profile-content`);
    }
  }
  for (const row of persisted) {
    if (!profile.units.some((unit) => unit.unitNumber === row.unitNumber)) {
      mismatches.push(`${row.unitNumber}:unexpected-persisted-row`);
    }
  }
  return {
    status: mismatches.length === 0 ? 'MATCH' : 'MISMATCH',
    mismatches,
  };
}

function requiredDatabaseUrl(target: DatabaseTarget): string {
  const databaseUrl = target === 'supabase'
    ? process.env.DATABASE_SUPABASE_URL ?? process.env.DATABASE_URL ?? process.env.DATABASE_LOCAL_URL
    : process.env.DATABASE_LOCAL_URL ?? process.env.DATABASE_URL ?? process.env.DATABASE_SUPABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error(
      'DATABASE_URL, DATABASE_LOCAL_URL, or DATABASE_SUPABASE_URL is required.',
    );
  }
  return databaseUrl;
}

function catalogSubjects(subjectSlug: string): readonly string[] {
  if (subjectSlug === 'success') return ['success', 'sungjik'];
  if (subjectSlug === 'industry') return ['industry', 'kongil'];
  return [subjectSlug];
}

function valueOf(
  arguments_: readonly string[],
  name: string,
): string | undefined {
  const argument = arguments_.find((value) => value.startsWith(`${name}=`));
  return argument?.slice(name.length + 1);
}

function integerValue(
  arguments_: readonly string[],
  name: string,
  fallback: number,
): number {
  const value = valueOf(arguments_, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

void main();
