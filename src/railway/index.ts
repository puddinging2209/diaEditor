export { exportRailwayJson, importRailwayJson, normalizeVirtualRailwayData, RailwayDataFormatError, validateVirtualRailwayShape } from './io.ts'
export { assignOperations, OperationAssignmentError } from './operationEngine.ts'
export { generatePatternTrains } from './patternGenerator.ts'
export type { OperationAssignmentOptions } from './operationEngine.ts'
export type { PatternGenerationOptions, TrainNumberRule } from './patternGenerator.ts'
export { IndexedDbRailwayStore } from './persistence.ts'
export { hasSharedStationName, mergeImportedRailway } from './importMerge.ts'
export { validateRailway } from './validator.ts'
export { digitsToTime, serviceDaySeconds, SERVICE_DAY_START_SECONDS } from './time.ts'
export type { RailwayValidationOptions } from './validator.ts'
export type {
  Operation,
  OperationEvent,
  ServiceRoute,
  Station,
  Train,
  TrainRoutePoint,
  TrainType,
  ValidationIssue,
  ValidationSeverity,
  VirtualRailwayData,
} from './types.ts'
