import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicCatalogService } from './public-catalog.service';

@Controller('public/catalog')
export class PublicCatalogController {
  constructor(private readonly catalog: PublicCatalogService) {}

  @Get()
  list(@Query() query: { query?: string; category?: string; priceTable?: string }) {
    return this.catalog.list(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.catalog.detail(id);
  }
}