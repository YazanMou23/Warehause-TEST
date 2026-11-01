import { IsString, IsOptional, IsArray, ValidateNested, IsInt, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export interface FieldWarning {
  field: string;
  message: string;
  severity: 'warning' | 'error' | 'info';
}

export class OtherWorkEntryDto {
  @IsOptional()
  @IsNumber()
  personal?: number;

  @IsOptional()
  @IsString()
  von?: string;

  @IsOptional()
  @IsString()
  bis?: string;

  @IsOptional()
  @IsString()
  bemerkung?: string;
}

export class ContainerListRowDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  containerListId?: string;

  @IsOptional()
  @IsInt()
  rowOrder?: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  containerNumber?: string;

  @IsOptional()
  @IsString()
  fuss?: string;

  @IsOptional()
  @IsString()
  artikel?: string;

  @IsOptional()
  @IsInt()
  kartons?: number;

  @IsOptional()
  @IsString()
  termin?: string;

  @IsOptional()
  @IsString()
  ankunft?: string;

  @IsOptional()
  @IsString()
  start?: string;

  @IsOptional()
  @IsString()
  ende?: string;

  @IsOptional()
  @IsInt()
  personal?: number;

  @IsOptional()
  @IsString()
  wartezeitVon?: string;

  @IsOptional()
  @IsString()
  wartezeitBis?: string;

  @IsOptional()
  @IsString()
  wartezeitStd?: string;

  @IsOptional()
  @IsString()
  wickel?: string;

  @IsOptional()
  @IsNumber()
  preis?: number;

  @IsOptional()
  @IsString()
  ps?: string;

  @IsOptional()
  @IsString()
  extraTeam?: string;

  @IsOptional()
  @IsString()
  bemerkung?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OtherWorkEntryDto)
  anderweitigeArbeiten?: OtherWorkEntryDto[];

  @IsOptional()
  warnings?: FieldWarning[];

  @IsOptional()
  uncertainFields?: string[];
}

export class CreateContainerListDto {
  @IsString()
  site!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  date?: string;

  @IsOptional()
  @IsString()
  rawFileName?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContainerListRowDto)
  rows!: ContainerListRowDto[];
}

export class UpdateContainerListDto {
  @IsOptional()
  @IsString()
  site?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  date?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContainerListRowDto)
  rows?: ContainerListRowDto[];
}
