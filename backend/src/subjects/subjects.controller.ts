import { Controller, Get, Param } from '@nestjs/common';
import { SubjectsService } from './subjects.service';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Get()
  async findAll() {
    return this.subjectsService.findAll();
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string) {
    return this.subjectsService.findBySlug(slug);
  }

  @Get(':slug/units')
  async findUnits(@Param('slug') slug: string) {
    return this.subjectsService.findUnitsBySlug(slug);
  }
}
