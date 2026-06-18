import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { WarehouseService } from './warehouse.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Post()
  @Roles(Role.MANAGER, Role.ADMIN)
  create(@Body() createWarehouseDto: CreateWarehouseDto, @CurrentUser('id') actorId: string) {
    return this.warehouseService.create(createWarehouseDto, actorId);
  }

  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    return this.warehouseService.findAll(p, l);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warehouseService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateWarehouseDto: UpdateWarehouseDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.warehouseService.update(id, updateWarehouseDto, actorId);
  }

  @Delete(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.warehouseService.deactivate(id, actorId);
  }
}
