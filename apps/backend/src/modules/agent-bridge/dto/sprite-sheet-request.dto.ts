export class SpriteSheetRequestDto {
  description?: string
}

export interface SpriteSheetUploadInput {
  description?: string
  imageBuffer?: Buffer
  imageMimeType?: string | null
  imageFilename?: string | null
}
