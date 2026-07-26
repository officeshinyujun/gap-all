import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { StudyProgress } from '../entities/study-progress.entity';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(StudyProgress)
    private readonly progressRepo: Repository<StudyProgress>,
  ) {}

  async findById(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    const { passwordHash, ...safe } = user;
    void passwordHash;
    return safe;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.userRepo.update(id, dto);
    return this.findById(id);
  }

  async deleteUser(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    await this.userRepo.remove(user);
  }

  async getStats(id: string) {
    const user = await this.userRepo.findOne({ where: { id } });
    const progressList = await this.progressRepo.find({
      where: { userId: id },
      relations: ['unit', 'unit.subject'],
    });

    const subjectMap = new Map<
      string,
      { slug: string; title: string; total: number; sum: number }
    >();

    for (const p of progressList) {
      const slug = p.unit.subject.slug;
      const title = p.unit.subject.title;
      if (!subjectMap.has(slug)) {
        subjectMap.set(slug, { slug, title, total: 0, sum: 0 });
      }
      const entry = subjectMap.get(slug)!;
      entry.total += 1;
      entry.sum += p.progressPercent;
    }

    const subjectStats = Array.from(subjectMap.values()).map((s) => ({
      subjectSlug: s.slug,
      subjectTitle: s.title,
      progressPercent: s.total > 0 ? Math.round(s.sum / s.total) : 0,
    }));

    const totalProgressPercent =
      subjectStats.length > 0
        ? Math.round(
            subjectStats.reduce((acc, s) => acc + s.progressPercent, 0) /
              subjectStats.length,
          )
        : 0;

    return {
      studyStreakDays: user?.studyStreakDays ?? 0,
      totalProgressPercent,
      subjectStats,
    };
  }
}
