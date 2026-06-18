import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { HallService } from './hall.service';
import { CreateHallDto } from './dto/create-hall.dto';
import { UpdateHallDto } from './dto/update-hall.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('halls')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HallController {
  constructor(private readonly hallService: HallService) {}

  @Post()
  @Roles(Role.MANAGER, Role.ADMIN)
  create(@Body() createHallDto: CreateHallDto, @CurrentUser('id') actorId: string) {
    return this.hallService.create(createHallDto, actorId);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    return this.hallService.findAll(p, l, warehouseId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.hallService.findOne(id);
  }

  @Get(':id/overview')
  getOverview(@Param('id') id: string) {
    return this.hallService.getOverview(id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateHallDto: UpdateHallDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.hallService.update(id, updateHallDto, actorId);
  }

  @Delete(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.hallService.deactivate(id, actorId);
  }
}
