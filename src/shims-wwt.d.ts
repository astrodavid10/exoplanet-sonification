import { Color, RenderContext } from "@wwtelescope/engine";

declare module "@wwtelescope/engine" {
  export class Grids {
    static drawAltAzGrid(renderContext: RenderContext, opacity: number, drawColor: Color): void;
    static _makeAltAzGridText(): void;
    static _altAzTextBatch: Text3dBatch | null;
    static _milkyWayImage: Texture;
  }

  export class Text3dBatch {
    constructor(height: number);
  }

  export class Texture {
    static fromUrl(url: string): Texture;
  }

  // Matrix3d ships in the engine bundle (index.js:18645 for multiplyMatrix, and
  // all sixteen get_mRC accessors) but is absent from its .d.ts. wwt-hacks.ts
  // gets away with importing it only because that file is @ts-nocheck'd;
  // declaring it here lets type-checked modules use it too.
  // The get_mRC names are the engine's, not ours — this only describes an
  // existing API, so the camelCase convention doesn't apply.
  /* eslint-disable @typescript-eslint/naming-convention */
  export class Matrix3d {
    static multiplyMatrix(matrix1: Matrix3d, matrix2: Matrix3d): Matrix3d;
    floatArray(): Float32Array;
    get_m11(): number; get_m12(): number; get_m13(): number; get_m14(): number;
    get_m21(): number; get_m22(): number; get_m23(): number; get_m24(): number;
    get_m31(): number; get_m32(): number; get_m33(): number; get_m34(): number;
    get_m41(): number; get_m42(): number; get_m43(): number; get_m44(): number;
  }
  /* eslint-enable @typescript-eslint/naming-convention */
}
