import 'dotenv/config';
import { DataSource } from 'typeorm';
import { SimplyReferenceHistoricalAuditDatabaseReader } from '../src/exams/simply-reference-historical-audit.reader';
import {
  SimplyReferenceHistoricalAuditService,
  renderSimplyReferenceHistoricalAuditJson,
} from '../src/exams/simply-reference-historical-audit.service';

async function main(): Promise<void> {
  if (isHelp(process.argv.slice(2))) {
    process.stdout.write('Usage: audit:simply-reference-history\n');
    return;
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: requiredDatabaseUrl(),
    synchronize: false,
  });
  try {
    await dataSource.initialize();
    const report = await new SimplyReferenceHistoricalAuditService(
      new SimplyReferenceHistoricalAuditDatabaseReader(
        dataSource.createQueryRunner(),
      ),
    ).audit();
    process.stdout.write(renderSimplyReferenceHistoricalAuditJson(report));
    process.exitCode = report.status === 'passed' ? 0 : 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

function isHelp(arguments_: readonly string[]): boolean {
  if (arguments_.length === 0) return false;
  if (arguments_.length === 1 && arguments_[0] === '--help') return true;
  throw new InvalidAuditCommandError();
}

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new DatabaseUrlRequiredError();
  }
  return databaseUrl;
}

class DatabaseUrlRequiredError extends Error {
  readonly name = 'DatabaseUrlRequiredError';

  constructor() {
    super('DATABASE_URL is required.');
  }
}

class InvalidAuditCommandError extends Error {
  readonly name = 'InvalidAuditCommandError';

  constructor() {
    super('Usage: audit:simply-reference-history');
  }
}

void main();
