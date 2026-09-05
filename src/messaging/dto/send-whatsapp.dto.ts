import { IsString, IsNotEmpty, IsArray, ArrayNotEmpty } from 'class-validator';

export class SendWhatsAppDto {
  @IsString()
  @IsNotEmpty({ message: 'phone must not be empty' })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'message must not be empty' })
  message: string;
}

export class SendWhatsAppBulkDto {
  @IsArray()
  @ArrayNotEmpty({ message: 'phones array must contain at least one number' })
  @IsString({ each: true })
  phones: string[];

  @IsString()
  @IsNotEmpty({ message: 'message must not be empty' })
  message: string;
}

export class BroadcastDto {
  @IsString()
  @IsNotEmpty()
  type: 'sms' | 'whatsapp';

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  userIds: string[];

  @IsString()
  @IsNotEmpty()
  message: string;
}

export class SendWhatsAppToAllDto {
  @IsString()
  @IsNotEmpty({ message: 'message must not be empty' })
  message: string;
}
