import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ContainerListsController } from './container-lists.controller';
import { ContainerListsService } from './container-lists.service';
import { ContainerExtractorService } from './container-extractor.service';

@Module({
  imports: [PrismaModule],
  controllers: [ContainerListsController],
  providers: [ContainerListsService, ContainerExtractorService],
  exports: [ContainerListsService, ContainerExtractorService],
})
export class ContainerListsModule {}
