import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ContainerExtractorService } from './container-extractor.service';
import { ContainerListsService } from './container-lists.service';
import { CreateContainerListDto, UpdateContainerListDto } from './dto/container-list.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('container-lists')
export class ContainerListsController {
  constructor(
    private readonly extractorService: ContainerExtractorService,
    private readonly listsService: ContainerListsService,
  ) {}

  /**
   * POST /container-lists/extract
   * Upload an image or PDF of a CTR-Liste.
   * Calls AI Vision / OCR extractor, calculates fields (e.g. Wartezeit Std),
   * generates per-field warnings for missing/uncertain handwriting,
   * and returns the draft JSON.
   * STRICT: Saves NOTHING to the database.
   */
  @Post('extract')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async extractDraft(
    @UploadedFile() file: Express.Multer.File,
    @Body('site') site?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Bitte laden Sie eine Bild- oder PDF-Datei der Containerliste hoch (Feld "file").');
    }

    return this.extractorService.extractDraft(file, site);
  }

  /**
   * POST /container-lists
   * Save a reviewed and confirmed container list to the database.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() dto: CreateContainerListDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.listsService.create(dto, userId);
  }

  /**
   * GET /container-lists
   * List all saved container lists with pagination and optional site filter.
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('site') site?: string,
  ) {
    const p = page ? parseInt(page, 10) : 1;
    const l = limit ? parseInt(limit, 10) : 10;
    return this.listsService.findAll(p, l, site);
  }

  /**
   * GET /container-lists/:id
   * Get single container list with all its rows.
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string) {
    return this.listsService.findOne(id);
  }

  /**
   * PATCH /container-lists/:id
   * Update container list metadata and/or rows.
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateContainerListDto,
  ) {
    return this.listsService.update(id, dto);
  }

  /**
   * DELETE /container-lists/:id
   * Remove a container list.
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string) {
    return this.listsService.remove(id);
  }

  /**
   * GET /container-lists/:id/export/xlsx
   * Export reviewed list to the site's original Excel template.
   */
  @Get(':id/export/xlsx')
  @UseGuards(JwtAuthGuard)
  async exportXlsx(@Param('id') id: string, @Res() res: Response) {
    const result = await this.listsService.exportXlsx(id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.download(result.filePath, result.filename);
  }

  /**
   * GET /container-lists/:id/export/pdf
   * Export reviewed list to PDF.
   */
  @Get(':id/export/pdf')
  @UseGuards(JwtAuthGuard)
  async exportPdf(@Param('id') id: string, @Res() res: Response) {
    const result = await this.listsService.exportPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    return res.download(result.filePath, result.filename);
  }
}
