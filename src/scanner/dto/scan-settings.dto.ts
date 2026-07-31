import { IsOptional, IsString, IsNumber, IsEnum, Min, Max } from 'class-validator';

export type ColorMode = 'Color' | 'Grayscale' | 'BlackAndWhite';
export type ScanFormat = 'jpeg' | 'png';

export class ScanSettingsDto {
  /** Override the SCANNER_IP from .env for this request */
  @IsOptional()
  @IsString()
  scannerIp?: string;

  /** Override the SCANNER_PORT from .env (80 for most brands, 8080 for HP) */
  @IsOptional()
  @IsNumber()
  scannerPort?: number;

  /** Color mode — default: Grayscale (best for OCR accuracy on timesheets) */
  @IsOptional()
  @IsEnum(['Color', 'Grayscale', 'BlackAndWhite'])
  colorMode?: ColorMode;

  /** Scan resolution in DPI — default: 300 (minimum recommended for OCR) */
  @IsOptional()
  @IsNumber()
  @Min(75)
  @Max(1200)
  dpi?: number;

  /** Output image format — default: jpeg */
  @IsOptional()
  @IsEnum(['jpeg', 'png'])
  format?: ScanFormat;

  /** Paper source: Platen (flatbed) or Feeder (ADF) — default: Platen */
  @IsOptional()
  @IsEnum(['Platen', 'Feeder'])
  inputSource?: 'Platen' | 'Feeder';
}
