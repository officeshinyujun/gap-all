function parseCommand(arguments_: readonly string[]): Command {
  if (arguments_.length === 0) return { kind: 'dry-run' };

  const targetSupabase = arguments_.includes('--target=supabase');
  const isConsolidate = arguments_.includes('--consolidate-duplicates');
  const isWrite = arguments_.includes('--write');
  const confirmationArg = arguments_.find((arg) =>
    arg.startsWith('--confirmation='),
  );
  const expectedConfirm = targetSupabase
    ? SUPABASE_CONFIRMATION
    : isConsolidate
      ? LOCAL_CONSOLIDATION_CONFIRMATION
      : LOCAL_WRITE_CONFIRMATION;

  if (!isConsolidate && !isWrite) {
    throw new Error(
      'Usage: plan-reference-catalog-legacy-migration [--target=supabase] [--write | --consolidate-duplicates] --confirmation=... [--backup=/path]',
    );
  }

  if (confirmationArg !== `--confirmation=${expectedConfirm}`) {
    const mode = isConsolidate ? 'Consolidation' : 'Write';
    throw new Error(`${mode} requires --confirmation=${expectedConfirm}`);
  }

  const backupArg = arguments_.find((arg) => arg.startsWith('--backup='));
  return {
    kind: isConsolidate ? 'consolidate-duplicates' : 'write-renames',
    backupPath:
      backupArg === undefined ? null : backupArg.slice('--backup='.length),
    confirmation: confirmationArg.slice('--confirmation='.length),
  };
}

function assertLocalWriteTarget(): void {
  if (!process.argv.includes('--target=supabase')) {
    if (
      process.env.DATABASE_LOCAL_URL === undefined ||
      process.env.DATABASE_URL !== process.env.DATABASE_LOCAL_URL
    ) {
      throw new Error(
        'Write mode is limited to DATABASE_LOCAL_URL. Use --target=supabase --confirmation=APPLY_TO_SUPABASE for Supabase.',
      );
    }
  }
}
