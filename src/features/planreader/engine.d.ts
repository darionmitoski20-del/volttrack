export interface EngineSheet {
  page: number;
  number: string;
  title: string;
  discipline: string;
  floor: string;
  level: number;
  width: number;
  height: number;
  offset: [number, number];
  image: Blob;
}
export interface EngineItem {
  sheet: string;
  cls: string;
  name: string;
  x: number;
  y: number;
  room: string;
  existing: boolean;
  conf: number;
  src: 'symbol' | 'text';
  group?: string;
  dims?: number[];
  feat?: string;
  crop?: string;
}
export interface LibraryJson {
  entries: { g: string; cls: string[]; dims: number[]; f: string }[];
  pf: { P: string; F: string };
}
export class Library {
  constructor(json: LibraryJson);
  add(g: string, cls: string[], dims: number[], fhex: string): void;
}
export const CLASSES: Record<string, string>;
export const UNCERTAIN: string[];
export function className(cls: string): string;
export function readPlan(
  pdfjsLib: unknown,
  data: Uint8Array,
  library: LibraryJson | Library,
  progress?: (message: string, percent: number) => void,
  imageScale?: number,
): Promise<{ sheets: EngineSheet[]; items: EngineItem[]; ms: number }>;
