import { timeToSeconds } from './time.ts'
import type { ValidationIssue, VirtualRailwayData } from './types.ts'

const TRAIN_TYPES = new Set(['Local', 'Express', 'LimitedExpress', 'OutofService'])

export class RailwayDataFormatError extends Error {
  readonly issues: ValidationIssue[]

  constructor(
    message: string,
    issues: ValidationIssue[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'RailwayDataFormatError'
    this.issues = issues
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addIssue(issues: ValidationIssue[], path: string, message: string) {
  issues.push({
    code: 'schema.invalid',
    severity: 'error',
    message: `${path}: ${message}`,
    entityIds: [path],
  })
}

function checkKeys(
  value: Record<string, unknown>,
  keys: string[],
  path: string,
  issues: ValidationIssue[],
  optionalKeys: string[] = [],
) {
  for (const key of keys) {
    if (!(key in value) && !optionalKeys.includes(key)) addIssue(issues, path, `missing "${key}".`)
  }
  for (const key of Object.keys(value)) {
    if (!keys.includes(key) && !optionalKeys.includes(key)) addIssue(issues, path, `unexpected "${key}".`)
  }
}

function checkString(value: unknown, path: string, issues: ValidationIssue[]) {
  if (typeof value !== 'string') addIssue(issues, path, 'must be a string.')
}

function checkTime(value: unknown, path: string, issues: ValidationIssue[]) {
  if (value === null) return
  if (typeof value !== 'string') {
    addIssue(issues, path, 'must be a time string or null.')
    return
  }
  try {
    timeToSeconds(value)
  } catch {
    addIssue(issues, path, 'must use the HH:MM:SS format.')
  }
}

function checkStringArray(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!Array.isArray(value)) {
    addIssue(issues, path, 'must be an array of strings.')
    return
  }
  value.forEach((entry, index) => checkString(entry, `${path}[${index}]`, issues))
}

function validateStation(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, 'must be an object.')
    return
  }
  checkKeys(
    value,
    ['id', 'name', 'kilopost', 'hasTracks', 'canTurnBack', 'isDepot', 'depotCapacity', 'networkPosition'],
    path,
    issues,
    ['networkPosition'],
  )
  checkString(value.id, `${path}.id`, issues)
  checkString(value.name, `${path}.name`, issues)
  if (typeof value.kilopost !== 'number' || !Number.isFinite(value.kilopost)) {
    addIssue(issues, `${path}.kilopost`, 'must be a finite number.')
  }
  for (const key of ['hasTracks', 'canTurnBack', 'isDepot']) {
    if (typeof value[key] !== 'boolean') addIssue(issues, `${path}.${key}`, 'must be a boolean.')
  }
  if (value.depotCapacity !== null &&
      (typeof value.depotCapacity !== 'number' || !Number.isFinite(value.depotCapacity) || value.depotCapacity < 0)) {
    addIssue(issues, `${path}.depotCapacity`, 'must be a non-negative number or null.')
  }
  if (value.networkPosition !== undefined) {
    if (!isRecord(value.networkPosition)) {
      addIssue(issues, `${path}.networkPosition`, 'must be an object.')
    } else {
      checkKeys(value.networkPosition, ['x', 'y'], `${path}.networkPosition`, issues)
      for (const key of ['x', 'y']) {
        if (typeof value.networkPosition[key] !== 'number' || !Number.isFinite(value.networkPosition[key])) {
          addIssue(issues, `${path}.networkPosition.${key}`, 'must be a finite number.')
        }
      }
    }
  }
}

function validateLine(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, 'must be an object.')
    return
  }
  checkKeys(value, ['id', 'name', 'stations'], path, issues)
  checkString(value.id, `${path}.id`, issues)
  checkString(value.name, `${path}.name`, issues)
  checkStringArray(value.stations, `${path}.stations`, issues)
}

function validateEvent(value: unknown, path: string, issues: ValidationIssue[]) {
  if (value === null) return
  if (!isRecord(value)) {
    addIssue(issues, path, 'must be an object or null.')
    return
  }
  checkKeys(value, ['type', 'operationId', 'targetTrainId'], path, issues)
  if (value.type !== 'combine' && value.type !== 'split') {
    addIssue(issues, `${path}.type`, 'must be "combine" or "split".')
  }
  checkString(value.operationId, `${path}.operationId`, issues)
  if (value.targetTrainId !== null) checkString(value.targetTrainId, `${path}.targetTrainId`, issues)
  if (value.type === 'combine' && value.targetTrainId !== null) {
    addIssue(issues, `${path}.targetTrainId`, 'must be null for a combine event.')
  }
}

function validateRoutePoint(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, 'must be an object.')
    return
  }
  checkKeys(
    value,
    ['stationId', 'arrivalTime', 'departureTime', 'trackNumber', 'operationEvent', 'isPassing'],
    path,
    issues,
    ['isPassing'],
  )
  checkString(value.stationId, `${path}.stationId`, issues)
  checkTime(value.arrivalTime, `${path}.arrivalTime`, issues)
  checkTime(value.departureTime, `${path}.departureTime`, issues)
  checkString(value.trackNumber, `${path}.trackNumber`, issues)
  validateEvent(value.operationEvent, `${path}.operationEvent`, issues)
  if (value.isPassing !== undefined && typeof value.isPassing !== 'boolean') {
    addIssue(issues, `${path}.isPassing`, 'must be a boolean when provided.')
  }
}

function validateTrain(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, 'must be an object.')
    return
  }
  checkKeys(value, [
    'id',
    'trainNumber',
    'type',
    'trainName',
    'typeName',
    'carCount',
    'serviceRouteId',
    'currentOperationIds',
    'originStationId',
    'destinationStationId',
    'route',
    'isDepotIn',
    'isDepotOut',
  ], path, issues, ['trainName', 'typeName', 'carCount', 'serviceRouteId'])
  for (const key of ['id', 'trainNumber', 'originStationId', 'destinationStationId']) {
    checkString(value[key], `${path}.${key}`, issues)
  }
  if (value.trainName !== undefined && typeof value.trainName !== 'string') {
    addIssue(issues, `${path}.trainName`, 'must be a string.')
  }
  if (value.typeName !== undefined && (typeof value.typeName !== 'string' || !value.typeName.trim())) {
    addIssue(issues, `${path}.typeName`, 'must be a non-empty string.')
  }
  if (value.serviceRouteId !== undefined) {
    checkString(value.serviceRouteId, `${path}.serviceRouteId`, issues)
  }
  if (value.carCount !== undefined &&
      (typeof value.carCount !== 'number' || !Number.isInteger(value.carCount) || value.carCount <= 0)) {
    addIssue(issues, `${path}.carCount`, 'must be a positive integer.')
  }
  if (typeof value.type !== 'string' || !TRAIN_TYPES.has(value.type)) {
    addIssue(issues, `${path}.type`, 'is not a supported train type.')
  }
  checkStringArray(value.currentOperationIds, `${path}.currentOperationIds`, issues)
  if (!Array.isArray(value.route)) {
    addIssue(issues, `${path}.route`, 'must be an array.')
  } else {
    value.route.forEach((point, index) => validateRoutePoint(point, `${path}.route[${index}]`, issues))
  }
  for (const key of ['isDepotIn', 'isDepotOut']) {
    if (typeof value[key] !== 'boolean') addIssue(issues, `${path}.${key}`, 'must be a boolean.')
  }
}

function validateOperation(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, 'must be an object.')
    return
  }
  checkKeys(value, ['id', 'carCount', 'trainIds'], path, issues)
  checkString(value.id, `${path}.id`, issues)
  if (typeof value.carCount !== 'number' || !Number.isInteger(value.carCount) || value.carCount <= 0) {
    addIssue(issues, `${path}.carCount`, 'must be a positive integer.')
  }
  checkStringArray(value.trainIds, `${path}.trainIds`, issues)
}

function validateTrackConnection(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, 'must be an object.')
    return
  }
  checkKeys(value, ['id', 'fromStationId', 'toStationId', 'trackCount'], path, issues)
  for (const key of ['id', 'fromStationId', 'toStationId']) {
    checkString(value[key], `${path}.${key}`, issues)
  }
  if (value.trackCount !== 1 && value.trackCount !== 2) {
    addIssue(issues, `${path}.trackCount`, 'must be 1 or 2.')
  }
}

function validateServiceRoute(value: unknown, path: string, issues: ValidationIssue[]) {
  if (!isRecord(value)) {
    addIssue(issues, path, 'must be an object.')
    return
  }
  checkKeys(value, ['id', 'name', 'stationIds'], path, issues)
  checkString(value.id, `${path}.id`, issues)
  checkString(value.name, `${path}.name`, issues)
  checkStringArray(value.stationIds, `${path}.stationIds`, issues)
}

export function validateVirtualRailwayShape(value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isRecord(value)) {
    addIssue(issues, '$', 'must be an object.')
    return issues
  }
  checkKeys(
    value,
    ['version', 'railwayName', 'stations', 'trains', 'operations'],
    '$',
    issues,
    ['lines', 'trainTypes', 'trackConnections', 'serviceRoutes'],
  )
  if (value.version !== '1.0.0') addIssue(issues, '$.version', 'must be "1.0.0".')
  checkString(value.railwayName, '$.railwayName', issues)
  if ('trainTypes' in value) {
    checkStringArray(value.trainTypes, '$.trainTypes', issues)
    if (Array.isArray(value.trainTypes) && value.trainTypes.some((name) => typeof name !== 'string' || !name.trim())) {
      addIssue(issues, '$.trainTypes', 'must contain non-empty names.')
    }
  }
  for (const key of ['lines', 'stations', 'trains', 'operations']) {
    if (key === 'lines' && !(key in value)) continue
    if (!Array.isArray(value[key])) {
      addIssue(issues, `$.${key}`, 'must be an array.')
      continue
    }
    value[key].forEach((entity, index) => {
      const path = `$.${key}[${index}]`
      if (key === 'lines') validateLine(entity, path, issues)
      if (key === 'stations') validateStation(entity, path, issues)
      if (key === 'trains') validateTrain(entity, path, issues)
      if (key === 'operations') validateOperation(entity, path, issues)
    })
  }
  const optionalEntityValidators: Array<{
    key: string
    validate: (entity: unknown, path: string, validationIssues: ValidationIssue[]) => void
  }> = [
    { key: 'trackConnections', validate: validateTrackConnection },
    { key: 'serviceRoutes', validate: validateServiceRoute },
  ]
  for (const { key, validate } of optionalEntityValidators) {
    if (!(key in value)) continue
    if (!Array.isArray(value[key])) {
      addIssue(issues, `$.${key}`, 'must be an array.')
      continue
    }
    value[key].forEach((entity, index) => validate(entity, `$.${key}[${index}]`, issues))
  }
  return issues
}

export function exportRailwayJson(data: VirtualRailwayData): string {
  const issues = validateVirtualRailwayShape(data)
  if (issues.length) {
    throw new RailwayDataFormatError('Railway data does not match the 1.0.0 schema.', issues)
  }
  return JSON.stringify(data, null, 2)
}

export function importRailwayJson(json: string): VirtualRailwayData {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch (error) {
    throw new RailwayDataFormatError('Railway JSON is not valid JSON.', [], { cause: error })
  }

  const issues = validateVirtualRailwayShape(value)
  if (issues.length) {
    throw new RailwayDataFormatError('Imported data does not match the 1.0.0 schema.', issues)
  }
  return value as VirtualRailwayData
}
