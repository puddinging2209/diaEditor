import { secondsToTime, timeToSeconds } from './time.ts'
import type { Train, TrainType } from './types.ts'

export interface TrainNumberRule {
  prefix: string
  firstNumber: number
  increment: number
  suffix: string
  width?: number
  templateOffsets?: Record<string, number>
}

export interface PatternGenerationOptions {
  startTime: string
  endTime: string
  intervalMinutes: number
  numberingRules: Partial<Record<TrainType, TrainNumberRule>>
  templateBaseTime?: string
  createTrainId?: (templateTrainId: string, cycleIndex: number) => string
}

export function generatePatternTrains(
  templateTrains: Train[],
  options: PatternGenerationOptions,
): Train[] {
  if (!templateTrains.length) return []
  if (!Number.isInteger(options.intervalMinutes) || options.intervalMinutes <= 0) {
    throw new Error('intervalMinutes must be a positive integer.')
  }

  const startSeconds = timeToSeconds(options.startTime)
  const endSeconds = timeToSeconds(options.endTime)
  if (endSeconds < startSeconds) {
    throw new Error('endTime must be at or after startTime.')
  }

  const templateIds = new Set(templateTrains.map((train) => train.id))
  if (templateIds.size !== templateTrains.length) {
    throw new Error('Template train IDs must be unique.')
  }

  const templateBaseTime = options.templateBaseTime ??
    templateTrains
      .flatMap((train) => train.route.map((point) => point.departureTime))
      .filter((time): time is string => time !== null)
      .sort((left, right) => timeToSeconds(left) - timeToSeconds(right))[0]
  if (!templateBaseTime) {
    throw new Error('Template trains must contain at least one departure time.')
  }

  for (const train of templateTrains) {
    const rule = options.numberingRules[train.type]
    if (!rule) {
      throw new Error(`Missing train number rule for type "${train.type}".`)
    }
    if (
      typeof rule.prefix !== 'string' ||
      typeof rule.suffix !== 'string' ||
      !Number.isInteger(rule.firstNumber) ||
      rule.firstNumber < 0 ||
      !Number.isInteger(rule.increment) ||
      rule.increment <= 0
    ) {
      throw new Error(`Train number rule for type "${train.type}" is invalid.`)
    }
  }

  const intervalSeconds = options.intervalMinutes * 60
  const generated: Train[] = []
  const generatedIds = new Set<string>()
  const generatedTrainNumbers = new Set<string>()
  const cycleCount = Math.floor((endSeconds - startSeconds) / intervalSeconds) + 1

  for (let cycleIndex = 0; cycleIndex < cycleCount; cycleIndex += 1) {
    const cycleStart = startSeconds + cycleIndex * intervalSeconds
    const idMap = new Map(
      templateTrains.map((train) => [
        train.id,
        options.createTrainId?.(train.id, cycleIndex) ?? `${train.id}-${cycleIndex + 1}`,
      ]),
    )

    for (const template of templateTrains) {
      const rule = options.numberingRules[template.type]!
      const templateOffset = rule.templateOffsets?.[template.id] ?? 0
      if (!Number.isInteger(templateOffset)) {
        throw new Error(`Template offset for train "${template.id}" must be an integer.`)
      }

      const number = rule.firstNumber + cycleIndex * rule.increment + templateOffset
      if (!Number.isInteger(number) || number < 0) {
        throw new Error(`Generated train number for "${template.id}" is invalid.`)
      }
      const width = rule.width ?? String(rule.firstNumber).length
      if (!Number.isInteger(width) || width < 1) {
        throw new Error('Train number rule width must be a positive integer.')
      }

      const id = idMap.get(template.id)!
      if (!id || generatedIds.has(id)) {
        throw new Error(`Generated train ID "${id}" is empty or duplicated.`)
      }
      generatedIds.add(id)
      const trainNumber = `${rule.prefix}${String(number).padStart(width, '0')}${rule.suffix}`
      if (generatedTrainNumbers.has(trainNumber)) {
        throw new Error(`Generated train number "${trainNumber}" is duplicated.`)
      }
      generatedTrainNumbers.add(trainNumber)

      const offsetSeconds = cycleStart - timeToSeconds(templateBaseTime)
      generated.push({
        ...template,
        id,
        trainNumber,
        currentOperationIds: [],
        route: template.route.map((point) => ({
          ...point,
          arrivalTime: point.arrivalTime === null
            ? null
            : secondsToTime(timeToSeconds(point.arrivalTime) + offsetSeconds),
          departureTime: point.departureTime === null
            ? null
            : secondsToTime(timeToSeconds(point.departureTime) + offsetSeconds),
          operationEvent: point.operationEvent === null
            ? null
            : {
              ...point.operationEvent,
              targetTrainId: point.operationEvent.targetTrainId === null
                ? null
                : idMap.get(point.operationEvent.targetTrainId) ?? point.operationEvent.targetTrainId,
            },
        })),
      })
    }
  }

  return generated
}
