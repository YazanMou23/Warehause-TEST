import { Controller, Post, Body, UploadedFile, UseInterceptors, UseGuards, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OcrService } from './ocr.service';
import { OcrUploadDto } from './dto/ocr-upload.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('ocr')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('upload')
  @Roles(Role.MANAGER, Role.ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() ocrUploadDto: OcrUploadDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return this.ocrService.processFile(file, ocrUploadDto.type);
  }
}
