import type { Confidence } from "../confidence.js";
import type { MoneyRate } from "../money.js";
import type { Instant } from "../temporal.js";
import type { WebUrl } from "../web-url.js";
import type { PortRequestContext, PortWarning } from "./context.js";

export const LABOR_STATISTIC_KINDS = ["percentile", "mean", "employment-count"] as const;

export type LaborStatisticKind = (typeof LABOR_STATISTIC_KINDS)[number];

export interface LaborDatasetReference {
  readonly provider: string;
  readonly datasetName: string;
  readonly releaseVersion: string;
  readonly retrievedAt: Instant;
  readonly sourceUrl: WebUrl;
  readonly licenseUrl: WebUrl;
}

export interface OccupationSearchRequest {
  readonly title: string;
  readonly alternateTitles: readonly string[];
  readonly skills: readonly string[];
  readonly limit: number;
  readonly context: PortRequestContext;
}

export interface OccupationMatch {
  readonly occupationCode: string;
  readonly title: string;
  readonly confidence: Confidence;
  readonly dataset: LaborDatasetReference;
}

export type LaborStatistic =
  | {
      readonly kind: "percentile";
      readonly percentile: number;
      readonly value: MoneyRate;
    }
  | {
      readonly kind: "mean";
      readonly value: MoneyRate;
    }
  | {
      readonly kind: "employment-count";
      readonly value: number;
    };

export interface SalaryStatisticsRequest {
  readonly occupationCode: string;
  readonly geographyCode: string;
  readonly context: PortRequestContext;
}

export interface SalaryStatisticsResult {
  readonly occupationCode: string;
  readonly geographyCode: string;
  readonly period: string;
  readonly statistics: readonly LaborStatistic[];
  readonly dataset: LaborDatasetReference;
  readonly warnings: readonly PortWarning[];
}

/** Approved public labor-data access; occupation-wide results are never employer salary claims. */
export interface LaborDataPort {
  searchOccupations(request: OccupationSearchRequest): Promise<readonly OccupationMatch[]>;
  salaryStatistics(request: SalaryStatisticsRequest): Promise<SalaryStatisticsResult>;
}
