// Ambient declarations for external modules without type definitions

declare module 'toml' {
  export function parse(text: string): any;
  export function stringify(obj: any): string;
}

declare module 'path' {
  export function basename(p: string, ext?: string): string;
  export function dirname(p: string): string;
  export function extname(p: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
  export function normalize(p: string): string;
  export function isAbsolute(p: string): boolean;
  export function relative(from: string, to: string): string;
  export const sep: string;
  export const delimiter: string;
}

// Add other module declarations as needed
