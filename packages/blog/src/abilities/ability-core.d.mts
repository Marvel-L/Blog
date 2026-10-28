export type AbilityGrade = 'N' | 'G' | 'B' | 'V' | 'O' | 'R';
export interface AbilityDocument {
  dimension: string;
  filename: string;
  title: string;
  content: string;
  filePath: string;
}
export interface AbilityData {
  config: Partial<Record<string, AbilityGrade>>;
  documents: AbilityDocument[];
}
export const ABILITY_DIMENSIONS: { title: string; description: string }[];
export const ABILITY_GRADES: Record<AbilityGrade, { name: string; rank: number; color: string }>;
export function validateAbilityConfig(value: unknown): Partial<Record<string, AbilityGrade>>;
export function abilityDocumentRoute(title: string, filename: string): string;
export function getAbilityRoutes(data: AbilityData): string[];
export function abilityPoint(index: number, rank: number, radius?: number): [number, number];
