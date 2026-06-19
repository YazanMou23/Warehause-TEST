import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards, ForbiddenException, BadRequestException, UseInterceptors, UploadedFile, Res } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { Response } from 'express';
import { existsSync, mkdirSync } from 'fs';
import { EmailService } from '../email/email.service';

const storage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = './uploads/profile-photos';
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${req.params.id}-${uniqueSuffix}${extname(file.originalname)}`);
  },
});

@Controller('employees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {}

  @Post()
  @Roles(Role.MANAGER, Role.ADMIN)
  create(@Body() createUserDto: CreateUserDto, @CurrentUser() currentUser: any) {
    return this.usersService.create(createUserDto, currentUser.id, currentUser.role);
  }

  @Get()
  @Roles(Role.MANAGER, Role.ADMIN)
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('role') role?: Role,
    @CurrentUser('role') actorRole?: Role,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    return this.usersService.findAll(p, l, actorRole, role);
  }

  @Delete('bulk')
  @Roles(Role.MANAGER, Role.ADMIN)
  bulkRemove(@Body('ids') ids: string[], @CurrentUser() currentUser: any) {
    return this.usersService.bulkDeactivate(ids, currentUser.id, currentUser.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() currentUser: any) {
    // Employees can only fetch their own profile
    if (currentUser.role === Role.EMPLOYEE && currentUser.id !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.usersService.findOne(id, currentUser.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() currentUser: any,
  ) {
    // Employees can only update their own profile
    if (currentUser.role === Role.EMPLOYEE && currentUser.id !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }
    // Strict limits for standard employees
    if (currentUser.role === Role.EMPLOYEE) {
      delete updateUserDto.username;
      delete updateUserDto.password;
      delete updateUserDto.phone;
      delete updateUserDto.role;
      delete updateUserDto.warehouseId;
      delete updateUserDto.hallId;
      delete updateUserDto.isActive;
      delete updateUserDto.employmentStart;
    } else if (currentUser.role !== Role.MANAGER && currentUser.role !== Role.ADMIN) {
      // General safety fallback
      delete updateUserDto.role;
      delete updateUserDto.warehouseId;
      delete updateUserDto.hallId;
      delete updateUserDto.isActive;
      delete updateUserDto.employmentStart;
    }
    return this.usersService.update(id, updateUserDto, currentUser.id, currentUser.role);
  }

  @Delete(':id')
  @Roles(Role.MANAGER, Role.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() currentUser: any) {
    return this.usersService.deactivate(id, currentUser.id, currentUser.role);
  }

  @Post(':id/photo')
  @UseInterceptors(FileInterceptor('photo', {
    storage,
    fileFilter: (req, file, cb) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
        return cb(new ForbiddenException('Only image files are allowed!'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 2 * 1024 * 1024 }
  }))
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() currentUser: any,
  ) {
    if (currentUser.role === Role.EMPLOYEE && currentUser.id !== id) {
      throw new ForbiddenException('You can only upload your own profile photo');
    }
    if (!file) {
      throw new ForbiddenException('No photo file uploaded');
    }
    const relativePath = `uploads/profile-photos/${file.filename}`;
    await this.usersService.updatePhoto(id, relativePath);
    return { photoUrl: `/employees/${id}/photo` };
  }

  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: any) {
    try {
      const user = await this.usersService.findOne(id);
      if (!user || !user.profilePhoto) {
        return res.status(404).send('No profile photo uploaded');
      }
      const filePath = join(process.cwd(), user.profilePhoto);
      if (!existsSync(filePath)) {
        return res.status(404).send('Photo file not found');
      }
      return res.sendFile(filePath);
    } catch (error) {
      return res.status(404).send('User or photo not found');
    }
  }

  @Get(':id/dashboard-summary')
  async getDashboardSummary(@Param('id') id: string, @CurrentUser() currentUser: any) {
    if (currentUser.role === Role.EMPLOYEE && currentUser.id !== id) {
      throw new ForbiddenException('You can only view your own dashboard summary');
    }
    return this.usersService.getEmployeeDashboardSummary(id);
  }

  @Post(':id/send-email')
  @Roles(Role.MANAGER, Role.ADMIN)
  async sendEmailToEmployee(
    @Param('id') id: string,
    @Body() body: { subject: string; message: string },
    @CurrentUser() currentUser: any,
  ) {
    if (!body.subject || !body.subject.trim()) {
      throw new BadRequestException('Email subject is required');
    }
    if (!body.message || !body.message.trim()) {
      throw new BadRequestException('Email message is required');
    }

    const employee = await this.usersService.findOne(id, currentUser.role);

    if (!employee.email) {
      throw new BadRequestException(
        `Employee "${employee.name}" does not have an email address on file. Please update their profile first.`,
      );
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(employee.email)) {
      throw new BadRequestException(`Invalid email address for employee: ${employee.email}`);
    }

    const sent = await this.emailService.sendCustomEmail(
      employee.email,
      body.subject.trim(),
      body.message.trim(),
      currentUser.name || 'LogiFlow Admin',
    );

    if (sent !== true) {
      throw new BadRequestException(
        `Failed to send email: ${sent}`
      );
    }

    return {
      success: true,
      message: `Email sent successfully to ${employee.name} (${employee.email})`,
      recipient: employee.email,
    };
  }
}
