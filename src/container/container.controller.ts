import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ContainerService } from './container.service';
import { CreateContainerDto } from './dto/create-container.dto';
import { UpdateContainerDto } from './dto/update-container.dto';
import { BulkImportContainersDto } from './dto/bulk-import-containers.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('containers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ContainerController {
  constructor(private readonly containerService: ContainerService) {}

  @Post()
  @Roles(Role.MANAGER, Role.ADMIN)
  create(@Body() createContainerDto: CreateContainerDto, @CurrentUser('id') actorId: string) {
    return this.containerService.create(createContainerDto, actorId);
  }

  @Post('bulk-import')
  @Roles(Role.MANAGER, Role.ADMIN)
  bulkImport(@Body() bulkImportDto: BulkImportContainersDto, @CurrentUser('id') actorId: string) {
    return this.containerService.bulkImport(bulkImportDto, actorId);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('hallId') hallId?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    return this.containerService.findAll(p, l, search, warehouseId, hallId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.containerService.findOne(id);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.containerService.getAuditTrail(id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateContainerDto: UpdateContainerDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.containerService.update(id, updateContainerDto, actorId);
  }

  @Delete(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.containerService.deactivate(id, actorId);
  }
}
