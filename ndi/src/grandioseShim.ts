import grandioseImport from "@stagetimerio/grandiose";

/**
 * @stagetimerio/grandiose ships a `dist/index.d.ts` that doesn't match its own
 * runtime exports (the .d.ts declares nested `const enum`s like `FourCC.BGRA`,
 * but `dist/index.js` actually exports flat constants like `FOURCC_BGRA` — see
 * its README's own usage example, which uses the flat names). This file
 * defines the real runtime shape we depend on and casts past the package's
 * broken bundled types rather than fighting them.
 */
export interface GrandioseSendFrame {
  xres: number;
  yres: number;
  frameRateN: number;
  frameRateD: number;
  fourCC: number;
  pictureAspectRatio: number;
  frameFormatType: number;
  lineStrideBytes: number;
  data: Buffer;
}

export interface GrandioseSender {
  video(frame: GrandioseSendFrame): Promise<void>;
  destroy(): Promise<void>;
  sourcename(): string;
  connections(): number;
}

export interface GrandioseModule {
  send(opts: { name: string; clockVideo?: boolean; clockAudio?: boolean }): Promise<GrandioseSender>;
  version(): string;
  isSupportedCPU(): boolean;
  FOURCC_BGRA: number;
  FORMAT_TYPE_PROGRESSIVE: number;
}

export const grandiose = grandioseImport as unknown as GrandioseModule;
