export enum GenerationStatus {
  IDLE = 'IDLE',
  GENERATING_OUTLINE = 'GENERATING_OUTLINE',
  REVIEWING_OUTLINE = 'REVIEWING_OUTLINE',
  GENERATING_BOOK = 'GENERATING_BOOK',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}

export interface Chapter {
  id: string;
  title: string;
  description: string;
  content?: string;
  imageUrl?: string;
  status: 'pending' | 'generating_text' | 'generating_image' | 'completed' | 'error';
}

export type BookFormat = 'ebook' | 'linkedin-carousel';

export interface BookConfig {
  topic: string;
  title: string;
  authorName: string;
  audience: string;
  tone: string;
  enableSearch: boolean;
  style: string;
  chapterCount: number;
  format: BookFormat;
}

export interface BookData {
  config: BookConfig;
  coverImage?: string;
  outline: Chapter[];
  generatedAt: Date;
}