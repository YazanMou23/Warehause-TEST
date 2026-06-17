import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateContainerDto } from './create-container.dto';

export class BulkImportContainersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateContainerDto)
  containers: CreateContainerDto[];
}
