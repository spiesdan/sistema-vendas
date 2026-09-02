import { Controller, Get, Post, Query, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RegionsService } from './regions.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('regions')
@UseGuards(AuthGuard('jwt'))
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  listRegions() {
    return this.regions.listRegions();
  }

  @Get('cities')
  listCities(@Query('regionId') regionId?: string, @Query('search') search?: string) {
    return this.regions.listCities(regionId, search);
  }

  @Get('map')
  @Roles('ADMIN', 'GESTOR', 'COMERCIAL', 'MARKETING')
  commercialMap() {
    return this.regions.commercialMap();
  }

  @Post('city')
  @Roles('ADMIN', 'GESTOR')
  upsertCity(
    @Body()
    body: {
      name: string;
      state: string;
      regionId?: string;
      latitude?: number;
      longitude?: number;
      potential?: number;
    },
  ) {
    return this.regions.upsertCity(body);
  }

  @Post('region')
  @Roles('ADMIN', 'GESTOR')
  upsertRegion(@Body() body: { name: string; code?: string }) {
    return this.regions.upsertRegion(body.name, body.code);
  }
}