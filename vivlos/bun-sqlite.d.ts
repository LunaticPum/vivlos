/** bun:sqlite 类型声明（避免 @types/bun 与 @types/node 冲突） */
declare module "bun:sqlite" {
  export class Database {
    constructor(path: string, options?: { readonly?: boolean; create?: boolean });
    query(sql: string): Statement;
    run(sql: string, ...params: unknown[]): void;
    exec(sql: string): void;
    close(): void;
  }

  export class Statement {
    run(...params: unknown[]): void;
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown | undefined;
  }
}
