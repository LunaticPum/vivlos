/** bun:sqlite 模块类型声明（避免 @types/bun 与 @types/node 冲突） */
declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean; create?: boolean });
    prepare<TReturn = unknown>(sql: string): Statement<TReturn>;
    query<TReturn = unknown>(sql: string): Statement<TReturn>;
    run(sql: string, ...params: unknown[]): void;
    exec(sql: string): void;
    close(): void;
  }

  export class Statement<TReturn = unknown> {
    run(...params: unknown[]): void;
    all(...params: unknown[]): TReturn[];
    get(...params: unknown[]): TReturn | undefined;
    values(...params: unknown[]): unknown[][];
    finalize(): void;
  }

  export type DatabaseType = Database;
}
