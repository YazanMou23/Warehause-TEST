import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { PlanningService } from './planning.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('planning')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlanningController {
  constructor(private readonly planningService: PlanningService) {}

  @Post()
  @Roles(Role.MANAGER, Role.ADMIN)
  create(@Body() createPlanDto: CreatePlanDto, @CurrentUser('id') actorId: string) {
    return this.planningService.create(createPlanDto, actorId);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    return this.planningService.findAll(p, l, startDate, endDate, warehouseId);
  }

  @Get('query')
  findByDateAndWarehouse(
    @Query('date') date: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    if (!date) {
      throw new BadRequestException('Query parameter "date" is required');
    }
    return this.planningService.findByDateAndWarehouse(date, warehouseId);
  }

  @Delete('bulk')
  @Roles(Role.MANAGER, Role.ADMIN)
  bulkRemove(@Body('ids') ids: string[], @CurrentUser('id') actorId: string) {
    return this.planningService.bulkDeactivate(ids, actorId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.planningService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() updatePlanDto: UpdatePlanDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.planningService.update(id, updatePlanDto, actorId);
  }

  @Delete(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser('id') actorId: string) {
    return this.planningService.deactivate(id, actorId);
  }
}
