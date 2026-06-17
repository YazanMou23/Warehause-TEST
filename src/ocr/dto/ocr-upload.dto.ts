import { IsEnum, IsNotEmpty } from 'class-validator';

export enum OcrExtractionType {
  CONTAINERS = 'CONTAINERS',
  TIMESHEETS = 'TIMESHEETS',
}

export class OcrUploadDto {
  @IsNotEmpty()
  @IsEnum(OcrExtractionType)
  type: OcrExtractionType;
}
