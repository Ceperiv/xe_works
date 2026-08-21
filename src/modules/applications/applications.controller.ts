import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    return this.applicationsService.getById(id);
  }

  @Post(':id/scrape')
  async scrape(@Param('id', ParseIntPipe) id: number) {
    return this.applicationsService.enqueueAdsTxtScrape(id);
  }

  @Post(':id/marketplace-refresh')
  async refreshMarketplace(@Param('id', ParseIntPipe) id: number) {
    return this.applicationsService.enqueueMarketplaceRefresh(id);
  }
}
