export interface BookChapterDefinition {
  id: string;
  title: string;
  group?: string;
  content: string;
  relatedPostIds?: string[];
}

export interface BookPackageDefinition {
  id: string;
  name: string;
  subtitle: string;
  edition: string;
  accent: string;
  chapters: BookChapterDefinition[];
}

export function getBookPackageDefinitions(): BookPackageDefinition[];
