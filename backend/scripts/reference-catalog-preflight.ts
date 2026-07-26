import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ReferenceQuestion } from '../src/entities/reference-question.entity';
import {
  ReferenceCatalogPreflightService,
  referenceCatalogPreflightExitCode,
  renderReferenceCatalogPreflightJson,
  renderReferenceCatalogPreflightMarkdown,
} from '../src/textbook/reference-catalog-preflight.service';
import { TextbookService } from '../src/textbook/textbook.service';

type OutputFormat = 'json' | 'markdown';

async function main(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    url: requiredDatabaseUrl(),
    entities: [ReferenceQuestion],
    synchronize: false,
  });
  try {
    await dataSource.initialize();
    const report = await new ReferenceCatalogPreflightService(
      dataSource.getRepository(ReferenceQuestion),
      new TextbookService(),
    ).preflight();
    process.stdout.write(render(report, outputFormat(process.argv.slice(2))));
    process.exitCode = referenceCatalogPreflightExitCode(report);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required.');
  }
  return databaseUrl;
}

function outputFormat(arguments_: readonly string[]): OutputFormat {
  if (arguments_.length === 0 || arguments_[0] === '--format=json') {
    return 'json';
  }
  if (arguments_.length === 1 && arguments_[0] === '--format=markdown') {
    return 'markdown';
  }
  throw new Error(
    'Usage: reference-catalog-preflight [--format=json|--format=markdown]',
  );
}

function render(
  report: Awaited<ReturnType<ReferenceCatalogPreflightService['preflight']>>,
  format: OutputFormat,
): string {
  switch (format) {
    case 'json':
      return renderReferenceCatalogPreflightJson(report);
    case 'markdown':
      return renderReferenceCatalogPreflightMarkdown(report);
    default:
      return assertNever(format);
  }
}

function assertNever(value: never): never {
  void value;
  throw new Error('Unexpected output format.');
}

void main();
