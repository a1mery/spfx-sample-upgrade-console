export type HealthResponse = {
  status: string;
};

export type Toolchain = 'gulp' | 'heft' | 'unknown';
export type VersionSource = 'package.json' | '.yo-rc.json' | null;

export interface SampleInfo {
  folder: string;
  title: string | null;
  spfxVersion: string | null;
  versionSource: VersionSource;
  toolchain: Toolchain;
  usesGraph: boolean;
  error: string | null;
}

export interface SampleRow extends SampleInfo {
  skipped: boolean;
  skipReason: string | null;
}

export interface SamplesResponse {
  samples: SampleRow[];
  scannedAt: string;
  total: number;
}
