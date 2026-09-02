import { Module } from '@nestjs/common';
import { OdvixClient } from './odvix.client';

@Module({
  providers: [OdvixClient],
  exports: [OdvixClient],
})
export class OdvixModule {}