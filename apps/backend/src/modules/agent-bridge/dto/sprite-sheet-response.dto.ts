export interface SpriteSheetResponseDto {
  character_description: string;
  input_kind: string;
  file_name: string;
  relative_image_path: string;
  absolute_image_path: string;
  image_width: number;
  image_height: number;
  final_sprite_height: number;
  generation_attempts: number;
  generation_model: string;
  validation: Record<string, unknown>;
  storage_record: Record<string, unknown>;
}
