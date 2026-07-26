import {
  ReferenceJobDeadline,
  type ReferenceJobDeadlineClock,
  type ReferenceJobDeadlineProviderBudget,
  type ReferenceJobDeadlineStage,
} from './reference-job-deadline';

class ControlledDeadlineClock implements ReferenceJobDeadlineClock {
  private currentMs = 0;
  private nextTimerId = 0;
  private readonly timers = new Map<
    number,
    Readonly<{ callback: () => void; dueAtMs: number }>
  >();

  now = (): number => this.currentMs;

  setTimeout = (callback: () => void, timeoutMs: number): number => {
    this.nextTimerId += 1;
    this.timers.set(this.nextTimerId, {
      callback,
      dueAtMs: this.currentMs + timeoutMs,
    });
    return this.nextTimerId;
  };

  clearTimeout = (timerId: number): void => {
    this.timers.delete(timerId);
  };

  advanceTo(nextMs: number): void {
    this.currentMs = nextMs;
    const expiredTimers = [...this.timers.entries()].filter(
      ([, timer]) => timer.dueAtMs <= this.currentMs,
    );
    for (const [timerId, timer] of expiredTimers) {
      this.timers.delete(timerId);
      timer.callback();
    }
  }

  timerCount(): number {
    return this.timers.size;
  }
}

function waitForAbort(
  budget: ReferenceJobDeadlineProviderBudget,
): Promise<never> {
  return new Promise((_resolve, reject) => {
    budget.signal.addEventListener(
      'abort',
      () => reject(new Error('Provider observed the abort signal.')),
      { once: true },
    );
  });
}

const stageMinimumUsefulBudgets = {
  planner: 10,
  final_generator: 20,
  semantic_verifier: 30,
} as const;

describe('ReferenceJobDeadline', () => {
  it('Given an expired deadline, When starting a planner provider call, Then rejects before invoking the provider', async () => {
    const clock = new ControlledDeadlineClock();
    clock.advanceTo(100);
    const deadline = new ReferenceJobDeadline({ deadlineAtMs: 100, clock });
    let callCount = 0;

    const when = deadline.runProviderCall('planner', 50, async () => {
      callCount += 1;
      return 'unreachable';
    });

    await expect(when).rejects.toMatchObject({
      name: 'ReferenceJobDeadlineExceededError',
      stage: 'planner',
      deadlineAtMs: 100,
    });
    expect(callCount).toBe(0);
  });

  it.each(['planner', 'final_generator', 'semantic_verifier'] as const)(
    'Given a %s provider call, When the job deadline expires during the call, Then aborts it with one typed deadline error',
    async (stage: ReferenceJobDeadlineStage) => {
      const clock = new ControlledDeadlineClock();
      const deadline = new ReferenceJobDeadline({
        deadlineAtMs: 100,
        clock,
        minimumUsefulBudgets: {
          planner: 1,
          final_generator: 1,
          semantic_verifier: 1,
        },
      });
      let observedTimeoutMs: number | undefined;

      const when = deadline.runProviderCall(stage, 500, async (budget) => {
        observedTimeoutMs = budget.timeoutMs;
        return waitForAbort(budget);
      });
      clock.advanceTo(100);

      await expect(when).rejects.toMatchObject({
        name: 'ReferenceJobDeadlineExceededError',
        stage,
        deadlineAtMs: 100,
      });
      expect(observedTimeoutMs).toBe(100);
    },
  );

  it('Given a provider that ignores abort, When the deadline expires, Then rejects before a late provider success and clears timers', async () => {
    const clock = new ControlledDeadlineClock();
    const deadline = new ReferenceJobDeadline({
      deadlineAtMs: 100,
      clock,
      minimumUsefulBudgets: {
        planner: 1,
        final_generator: 1,
        semantic_verifier: 1,
      },
    });
    let observedSignal: AbortSignal | undefined;
    let resolveProvider: ((value: string) => void) | undefined;
    const providerResult = new Promise<string>((resolve) => {
      resolveProvider = resolve;
    });

    const when = deadline.runProviderCall('planner', 500, async (budget) => {
      observedSignal = budget.signal;
      return providerResult;
    });
    clock.advanceTo(100);
    for (let microtask = 0; microtask < 4; microtask += 1) {
      await Promise.resolve();
    }
    let settled = false;
    void when.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await Promise.resolve();

    expect(settled).toBe(true);
    await expect(when).rejects.toMatchObject({
      name: 'ReferenceJobDeadlineExceededError',
      stage: 'planner',
      deadlineAtMs: 100,
    });
    resolveProvider?.('late success');
    expect(observedSignal?.aborted).toBe(true);
    expect(clock.timerCount()).toBe(0);
  });

  it('Given concurrent jobs with separate deadlines, When one expires, Then the other retains its own provider budget', async () => {
    const clock = new ControlledDeadlineClock();
    const expiredJob = new ReferenceJobDeadline({ deadlineAtMs: 100, clock });
    const activeJob = new ReferenceJobDeadline({
      deadlineAtMs: 200,
      clock,
      minimumUsefulBudgets: {
        planner: 1,
        final_generator: 1,
        semantic_verifier: 1,
      },
    });
    clock.advanceTo(100);
    let expiredCallCount = 0;
    let activeTimeoutMs: number | undefined;

    const expiredCall = expiredJob.runProviderCall('planner', 500, async () => {
      expiredCallCount += 1;
      return 'unreachable';
    });
    const activeCall = activeJob.runProviderCall(
      'planner',
      500,
      async (budget) => {
        activeTimeoutMs = budget.timeoutMs;
        return 'active';
      },
    );

    await expect(expiredCall).rejects.toMatchObject({
      name: 'ReferenceJobDeadlineExceededError',
      stage: 'planner',
    });
    await expect(activeCall).resolves.toBe('active');
    expect(expiredCallCount).toBe(0);
    expect(activeTimeoutMs).toBe(100);
  });

  it('Given a retry wait longer than the remaining job budget, When waiting would consume downstream reserve, Then rejects with typed admission without scheduling a timer', async () => {
    const clock = new ControlledDeadlineClock();
    const deadline = new ReferenceJobDeadline({
      deadlineAtMs: 100,
      clock,
      minimumUsefulBudgets: {
        planner: 1,
        final_generator: 1,
        semantic_verifier: 1,
      },
    });
    const when = deadline.waitForRetry('planner', 500);

    await expect(when).rejects.toMatchObject({
      name: 'ReferenceJobDeadlineAdmissionError',
      stage: 'planner',
    });
    expect(clock.timerCount()).toBe(0);
  });

  it.each([
    ['planner', 60],
    ['final_generator', 50],
    ['semantic_verifier', 30],
  ] as const)(
    'Given exactly the %s downstream reserve, When starting its provider call, Then invokes the provider',
    async (stage, deadlineAtMs) => {
      const clock = new ControlledDeadlineClock();
      const deadline = new ReferenceJobDeadline({
        deadlineAtMs,
        clock,
        minimumUsefulBudgets: stageMinimumUsefulBudgets,
      });
      let callCount = 0;

      await expect(
        deadline.runProviderCall(stage, 500, async () => {
          callCount += 1;
          return 'admitted';
        }),
      ).resolves.toBe('admitted');

      expect(callCount).toBe(1);
    },
  );

  it('Given one millisecond less than the planner downstream reserve, When starting a planner provider call, Then rejects without invoking the provider', async () => {
    const clock = new ControlledDeadlineClock();
    const deadline = new ReferenceJobDeadline({
      deadlineAtMs: 59,
      clock,
      minimumUsefulBudgets: stageMinimumUsefulBudgets,
    });
    let callCount = 0;

    await expect(
      deadline.runProviderCall('planner', 500, async () => {
        callCount += 1;
        return 'unreachable';
      }),
    ).rejects.toMatchObject({
      name: 'ReferenceJobDeadlineAdmissionError',
      stage: 'planner',
      requiredReserveMs: 60,
      remainingMs: 59,
    });

    expect(callCount).toBe(0);
  });

  it('Given a planner retry whose delay would consume downstream reserve, When waiting to retry, Then rejects before scheduling another provider attempt', async () => {
    const clock = new ControlledDeadlineClock();
    const deadline = new ReferenceJobDeadline({
      deadlineAtMs: 60,
      clock,
      minimumUsefulBudgets: stageMinimumUsefulBudgets,
    });

    await expect(deadline.waitForRetry('planner', 1)).rejects.toMatchObject({
      name: 'ReferenceJobDeadlineAdmissionError',
      stage: 'planner',
      requiredReserveMs: 61,
      remainingMs: 60,
    });
    expect(clock.timerCount()).toBe(0);
  });
});
