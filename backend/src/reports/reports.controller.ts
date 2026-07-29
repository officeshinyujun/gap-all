import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateErrorReportDto } from './dto/create-error-report.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('error')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 3 } })
  submitErrorReport(@Body() dto: CreateErrorReportDto) {
    return this.reportsService.submitErrorReport(dto);
  }
}
