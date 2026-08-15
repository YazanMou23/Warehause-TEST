import { IsString, IsOptional, IsEnum, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentSource } from '@prisma/client';

export class CreateBatchDto {
  @IsString()
  @IsOptional()
  title?: string;
}

export class IngestPageInputDto {
  @IsNumber()
  pageNumber: number;

  @IsString()
  base64Data: string; // Base64 image data or URI

  @IsString()
  @IsOptional()
  mimeType?: string;
}

export class IngestDocumentInputDto {
  @IsString()
  originalFileName: string;

  @IsEnum(DocumentSource)
  source: DocumentSource;

  @IsString()
  @IsOptional()
  mimeType?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestPageInputDto)
  pages: IngestPageInputDto[];

  @IsString()
  @IsOptional()
  ocrLanguage?: string;
}

export class IngestBatchPayloadDto {
  @IsString()
  @IsOptional()
  batchId?: string;

  @IsString()
  @IsOptional()
  batchTitle?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestDocumentInputDto)
  documents: IngestDocumentInputDto[];
}
