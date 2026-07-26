import { ExamsController } from './exams.controller';

describe('ExamsController generation compatibility', () => {
  it('delegates create and job creation without changing result DTOs', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'exam-1', items: [] });
    const createJob = jest
      .fn()
      .mockResolvedValue({ jobId: 'job-1', status: 'pending', progress: 0 });
    const controller = new ExamsController({ create, createJob } as never);
    const user = { id: 'user-1', role: 'student', email: 'u@example.com' };
    const dto = { sourceType: 'ai' };
    await expect(controller.create(user, dto as never)).resolves.toEqual({
      id: 'exam-1',
      items: [],
    });
    await expect(controller.createJob(user, dto as never)).resolves.toEqual({
      jobId: 'job-1',
      status: 'pending',
      progress: 0,
    });
    expect(create).toHaveBeenCalledWith('user-1', dto);
    expect(createJob).toHaveBeenCalledWith('user-1', dto);
  });
});
