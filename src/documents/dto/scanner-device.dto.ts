import { IsOptional, IsString, IsNumber, IsBoolean, IsEnum, Min, Max } from 'class-validator';

export class SaveScannerDeviceDto {
  @IsString()
  deviceIdentifier: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsString()
  deviceName: string;

  @IsOptional()
  @IsString()
  lastKnownIp?: string;

  @IsOptional()
  @IsNumber()
  port?: number;

  @IsOptional()
  @IsString()
  protocol?: string;

  @IsOptional()
  capabilities?: {
    hasAdf: boolean;
    hasFlatbed: boolean;
    supportedDpi: number[];
    colorModes: string[];
    documentFormats: string[];
  };

  @IsOptional()
  @IsBoolean()
  isScanner?: boolean;

  @IsOptional()
  @IsBoolean()
  isPrinter?: boolean;

  @IsOptional()
  @IsBoolean()
  hasAdf?: boolean;

  @IsOptional()
  @IsBoolean()
  hasFlatbed?: boolean;
}

export class TriggerScanOptionsDto {
  @IsOptional()
  @IsString()
  scannerIp?: string;

  @IsOptional()
  @IsNumber()
  scannerPort?: number;

  @IsOptional()
  @IsEnum(['Color', 'Grayscale', 'BlackAndWhite'])
  colorMode?: 'Color' | 'Grayscale' | 'BlackAndWhite';

  @IsOptional()
  @IsNumber()
  @Min(75)
  @Max(1200)
  dpi?: number;

  @IsOptional()
  @IsEnum(['jpeg', 'png', 'pdf'])
  format?: string;

  @IsOptional()
  @IsEnum(['Platen', 'Feeder'])
  inputSource?: 'Platen' | 'Feeder';

  @IsOptional()
  @IsBoolean()
  batchScan?: boolean;

  @IsOptional()
  @IsString()
  deviceId?: string;   // saved ScannerDevice.id — for job tracking
}
