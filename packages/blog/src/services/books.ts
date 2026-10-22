import type { BookPackageDefinition } from '@/books/books-core.mjs';

const generatedBooks = import.meta.glob<BookPackageDefinition[]>('../../../../generated/books.json', {
  eager: true,
  import: 'default',
});

/** The same build-time snapshot supplies both SSR and the client first render. */
export const getBookPackageDefinitions = (): BookPackageDefinition[] => Object.values(generatedBooks)[0] ?? [];
