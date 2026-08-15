import { IsString, IsOptional, IsNumber, IsBoolean, IsIn } from 'class-validator';

export class TriggerScanOptionsDto {
  @IsString()
  @IsOptional()
  scannerIp?: string;

  @IsNumber()
  @IsOptional()
  scannerPort?: number;

  @IsString()
  @IsOptional()
  @IsIn(['Color', 'Grayscale', 'BlackAndWhite'])
  colorMode?: 'Color' | 'Grayscale' | 'BlackAndWhite';

  @IsNumber()
  @IsOptional()
  dpi?: number;

  @IsString()
  @IsOptional()
  @IsIn(['pdf', 'jpeg', 'png'])
  format?: 'pdf' | 'jpeg' | 'png';

  @IsString()
  @IsOptional()
  @IsIn(['Platen', 'Feeder'])
  inputSource?: 'Platen' | 'Feeder';

  @IsBoolean()
  @IsOptional()
  batchScan?: boolean;
}
