declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<{
    (inputs: any[]): any;
    F: {
      toObject(h: any): bigint;
      toString(h: any): string;
    };
  }>;
}
