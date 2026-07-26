export const REFERENCE_JOB_DEADLINE_STAGES = [
  'planner',
  'final_generator',
  'semantic_verifier',
] as const;

export type ReferenceJobDeadlineStage =
  (typeof REFERENCE_JOB_DEADLINE_STAGES)[number];

export type ReferenceJobDeadlineStageMinimumUsefulBudgets = Readonly<
  Record<ReferenceJobDeadlineStage, number>
>;

export const DEFAULT_REFERENCE_JOB_DEADLINE_STAGE_MINIMUM_USEFUL_BUDGETS = {
  planner: 30_000,
  final_generator: 30_000,
  semantic_verifier: 30_000,
} as const satisfies ReferenceJobDeadlineStageMinimumUsefulBudgets;

export type ReferenceJobDeadlineTimer = number | ReturnType<typeof setTimeout>;

export type ReferenceJobDeadlineClock = Readonly<{
  now: () => number;
  setTimeout: (
    callback: () => void,
    timeoutMs: number,
  ) => ReferenceJobDeadlineTimer;
  clearTimeout: (timer: ReferenceJobDeadlineTimer) => void;
}>;

export type ReferenceJobDeadlineProviderBudget = Readonly<{
  signal: AbortSignal;
  timeoutMs: number;
}>;

export type ReferenceJobDeadlineOptions = Readonly<{
  deadlineAtMs: number;
  clock?: ReferenceJobDeadlineClock;
  minimumUsefulBudgets?: ReferenceJobDeadlineStageMinimumUsefulBudgets;
}>;

const systemClock: ReferenceJobDeadlineClock = {
  now: () => Date.now(),
  setTimeout: (callback, timeoutMs) => setTimeout(callback, timeoutMs),
  clearTimeout: (timer) => clearTimeout(timer),
};

export class ReferenceJobDeadlineExceededError extends Error {
  readonly name: string = 'ReferenceJobDeadlineExceededError';

  constructor(
    readonly stage: ReferenceJobDeadlineStage,
    readonly deadlineAtMs: number,
  ) {
    super(`Reference job deadline expired before ${stage}.`);
  }
}

export class ReferenceJobDeadlineAdmissionError extends ReferenceJobDeadlineExceededError {
  readonly name = 'ReferenceJobDeadlineAdmissionError';

  constructor(
    stage: ReferenceJobDeadlineStage,
    deadlineAtMs: number,
    readonly requiredReserveMs: number,
    readonly remainingMs: number,
  ) {
    super(stage, deadlineAtMs);
  }
}

export class ReferenceJobDeadline {
  private readonly clock: ReferenceJobDeadlineClock;

  constructor(private readonly options: ReferenceJobDeadlineOptions) {
    this.clock = options.clock ?? systemClock;
  }

  minimumUsefulBudget(stage: ReferenceJobDeadlineStage): number {
    return (this.options.minimumUsefulBudgets ??
      DEFAULT_REFERENCE_JOB_DEADLINE_STAGE_MINIMUM_USEFUL_BUDGETS)[stage];
  }

  assertProviderAdmission(
    stage: ReferenceJobDeadlineStage,
    additionalReserveMs = 0,
  ): void {
    const remainingMs = this.remainingMs(stage);
    const requiredReserveMs =
      this.minimumUsefulReserve(stage) + additionalReserveMs;
    if (remainingMs < requiredReserveMs) {
      throw new ReferenceJobDeadlineAdmissionError(
        stage,
        this.options.deadlineAtMs,
        requiredReserveMs,
        remainingMs,
      );
    }
  }

  async runProviderCall<T>(
    stage: ReferenceJobDeadlineStage,
    configuredTimeoutMs: number,
    providerCall: (budget: ReferenceJobDeadlineProviderBudget) => Promise<T>,
  ): Promise<T> {
    this.assertProviderAdmission(stage);
    const remainingMs = this.remainingMs(stage);
    const timeoutMs = Math.min(configuredTimeoutMs, remainingMs);
    const controller = new AbortController();
    let deadlineTimeout: ReferenceJobDeadlineTimer | undefined;
    const deadlineExceeded = new Promise<never>((_resolve, reject) => {
      deadlineTimeout = this.clock.setTimeout(() => {
        reject(this.expired(stage));
        controller.abort();
      }, remainingMs);
    });
    const providerTimeout = this.clock.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      return await Promise.race([
        providerCall({ signal: controller.signal, timeoutMs }),
        deadlineExceeded,
      ]);
    } finally {
      this.clock.clearTimeout(providerTimeout);
      if (deadlineTimeout !== undefined) {
        this.clock.clearTimeout(deadlineTimeout);
      }
    }
  }

  async waitForRetry(
    stage: ReferenceJobDeadlineStage,
    retryDelayMs: number,
    additionalReserveMs = 0,
  ): Promise<void> {
    this.assertProviderAdmission(
      stage,
      Math.max(0, retryDelayMs) + additionalReserveMs,
    );
    if (retryDelayMs <= 0) return;
    const remainingMs = this.remainingMs(stage);
    const timeoutMs = Math.min(retryDelayMs, remainingMs);

    await new Promise<void>((resolve, reject) => {
      this.clock.setTimeout(() => {
        if (this.clock.now() >= this.options.deadlineAtMs) {
          reject(this.expired(stage));
          return;
        }
        resolve();
      }, timeoutMs);
    });
  }

  assertActive(stage: ReferenceJobDeadlineStage): void {
    this.remainingMs(stage);
  }

  private remainingMs(stage: ReferenceJobDeadlineStage): number {
    const remainingMs = this.options.deadlineAtMs - this.clock.now();
    if (remainingMs <= 0) throw this.expired(stage);
    return remainingMs;
  }

  private minimumUsefulReserve(stage: ReferenceJobDeadlineStage): number {
    const stageIndex = REFERENCE_JOB_DEADLINE_STAGES.indexOf(stage);
    return REFERENCE_JOB_DEADLINE_STAGES.slice(stageIndex).reduce(
      (total, currentStage) => total + this.minimumUsefulBudget(currentStage),
      0,
    );
  }

  private expired(
    stage: ReferenceJobDeadlineStage,
  ): ReferenceJobDeadlineExceededError {
    return new ReferenceJobDeadlineExceededError(
      stage,
      this.options.deadlineAtMs,
    );
  }
}
