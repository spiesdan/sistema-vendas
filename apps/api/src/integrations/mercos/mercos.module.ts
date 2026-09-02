import { Module } from '@nestjs/common';
import { MercosClient } from './mercos.client';

@Module({
  providers: [MercosClient],
  exports: [MercosClient],
})
export class MercosModule {}