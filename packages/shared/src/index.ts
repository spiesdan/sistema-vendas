// =========================================================================
//  Conteúdos compartilhados (safe para uso em backend e frontend)
// =========================================================================

export * from './constants';

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type DecimalLike = number | string;

export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}