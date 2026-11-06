import { getTrainEndTime, getTrainStartTime, timeToSeconds } from './time.ts'
import type { Operation, Train, VirtualRailwayData } from './types.ts'

export interface OperationAssignmentOptions {
  minimumTurnaroundMinutes?: number
  defaultCarCount?: number
  operationCarCounts?: Record<string, number>
  expectedCarCounts?: Record<string, number>
  createOperationId?: (sequence: number) => string
}

export class OperationAssignmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OperationAssignmentError'
  }
}

interface TrainTiming {
  train: Train
  startTime: string
  endTime: string
  startSeconds: number
  endSeconds: number
}

interface OperationUse {
  trainId: string
  timeSeconds: number
  stationId: string
}

const defaultOperationId = (sequence: number) => `AUTO-${String(sequence).padStart(3, '0')}`

export function assignOperations(
  data: VirtualRailwayData,
  options: OperationAssignmentOptions = {},
): VirtualRailwayData {
  const minimumTurnaroundMinutes = options.minimumTurnaroundMinutes ?? 3
  const defaultCarCount = options.defaultCarCount ?? 1
  const minimumTurnaroundSeconds = minimumTurnaroundMinutes * 60

  if (!Number.isFinite(minimumTurnaroundMinutes) || minimumTurnaroundMinutes < 0) {
    throw new OperationAssignmentError('minimumTurnaroundMinutes must be a non-negative number.')
  }
  if (!Number.isInteger(defaultCarCount) || defaultCarCount <= 0) {
    throw new OperationAssignmentError('defaultCarCount must be a positive integer.')
  }
  for (const [trainId, carCount] of Object.entries(options.expectedCarCounts ?? {})) {
    if (!Number.isInteger(carCount) || carCount <= 0) {
      throw new OperationAssignmentError(`Expected car count for train "${trainId}" must be a positive integer.`)
    }
  }

  const oldCarCounts = new Map(data.operations.map((operation) => [operation.id, operation.carCount]))
  const operationCarCounts = new Map(Object.entries(options.operationCarCounts ?? {}))
  const trains: Train[] = data.trains.map((train) => ({ ...train, currentOperationIds: [] }))
  const reservedOperationIds = new Set([
    ...oldCarCounts.keys(),
    ...trains.flatMap((train) => train.route.flatMap((point) =>
      point.operationEvent ? [point.operationEvent.operationId] : [],
    )),
  ])
  const trainById = new Map(trains.map((train) => [train.id, train]))
  if (trainById.size !== trains.length) {
    throw new OperationAssignmentError('Train IDs must be unique before assigning operations.')
  }

  const timings = trains.map((train): TrainTiming => {
    const startTime = getTrainStartTime(train)
    const endTime = getTrainEndTime(train)
    if (!startTime || !endTime) {
      throw new OperationAssignmentError(`Train "${train.id}" must have a start and end time.`)
    }
    const startSeconds = timeToSeconds(startTime)
    const endSeconds = timeToSeconds(endTime)
    if (endSeconds < startSeconds) {
      throw new OperationAssignmentError(`Train "${train.id}" ends before it starts.`)
    }
    return { train, startTime, endTime, startSeconds, endSeconds }
  }).sort((left, right) => left.startSeconds - right.startSeconds || left.train.id.localeCompare(right.train.id))

  const operationMap = new Map<string, Operation>()
  const operationUses = new Map<string, OperationUse[]>()
  let generatedSequence = 1

  const resolveCarCount = (id: string) => {
    const value = operationCarCounts.get(id) ?? oldCarCounts.get(id) ?? defaultCarCount
    if (!Number.isInteger(value) || value <= 0) {
      throw new OperationAssignmentError(`Operation "${id}" must have a positive integer carCount.`)
    }
    return value
  }

  const ensureOperation = (id: string): Operation => {
    let operation = operationMap.get(id)
    if (!operation) {
      operation = { id, carCount: resolveCarCount(id), trainIds: [] }
      operationMap.set(id, operation)
      operationUses.set(id, [])
    }
    return operation
  }

  const addUse = (operationId: string, train: Train, time: string, stationId: string) => {
    const operation = ensureOperation(operationId)
    const uses = operationUses.get(operationId)!
    if (!uses.some((use) => use.trainId === train.id)) {
      const expectedCarCount = options.expectedCarCounts?.[train.id]
      const assignedCarCount = train.currentOperationIds.reduce(
        (total, currentId) => total + (operationMap.get(currentId)?.carCount ?? 0),
        0,
      )
      if (expectedCarCount !== undefined && assignedCarCount + operation.carCount > expectedCarCount) {
        throw new OperationAssignmentError(
          `Operation "${operationId}" exceeds the ${expectedCarCount}-car limit for train "${train.id}".`,
        )
      }
      uses.push({ trainId: train.id, timeSeconds: timeToSeconds(time), stationId })
      operation.trainIds.push(train.id)
    }
    if (!train.currentOperationIds.includes(operationId)) {
      train.currentOperationIds.push(operationId)
    }
    return operation
  }

  const createOperation = (train: Train, timing: TrainTiming) => {
    let id = (options.createOperationId ?? defaultOperationId)(generatedSequence++)
    if (!id) throw new OperationAssignmentError('createOperationId must return a non-empty ID.')
    while (operationMap.has(id) || reservedOperationIds.has(id)) {
      if (options.createOperationId) {
        throw new OperationAssignmentError(`createOperationId returned duplicate or reserved ID "${id}".`)
      }
      id = defaultOperationId(generatedSequence++)
    }

    addUse(id, train, timing.startTime, train.originStationId)
    return operationMap.get(id)!
  }

  for (const timing of timings) {
    const candidates = [...operationMap.values()]
      .filter((operation) => operation.trainIds.length > 0)
      .map((operation) => {
        const lastTrain = trainById.get(operation.trainIds.at(-1)!)
        const lastEndTime = lastTrain ? getTrainEndTime(lastTrain) : null
        const lastEndSeconds = lastEndTime ? timeToSeconds(lastEndTime) : Number.POSITIVE_INFINITY
        return { operation, lastTrain, lastEndTime, lastEndSeconds }
      })
      .filter(({ lastTrain, lastEndSeconds }) =>
        lastTrain?.destinationStationId === timing.train.originStationId &&
        timing.startSeconds - lastEndSeconds >= minimumTurnaroundSeconds,
      )
      .sort((left, right) => right.lastEndSeconds - left.lastEndSeconds || left.operation.id.localeCompare(right.operation.id))

    const assigned = candidates[0]?.operation ?? createOperation(timing.train, timing)
    if (!timing.train.currentOperationIds.includes(assigned.id)) {
      assigned.trainIds.push(timing.train.id)
      addUse(assigned.id, timing.train, timing.startTime, timing.train.originStationId)
    }
  }

  const renameOperation = (fromId: string, toId: string): Operation => {
    const operation = operationMap.get(fromId)!
    const existing = operationMap.get(toId)
    if (existing) return existing

    operationMap.delete(fromId)
    operationUses.set(toId, operationUses.get(fromId)!)
    operationUses.delete(fromId)
    operation.id = toId
    operation.carCount = resolveCarCount(toId)
    operationMap.set(toId, operation)
    for (const train of trains) {
      train.currentOperationIds = train.currentOperationIds.map((id) => id === fromId ? toId : id)
    }
    return operation
  }

  const findPriorOperation = (stationId: string, eventSeconds: number, currentTrainId: string) =>
    [...operationMap.values()]
      .filter((operation) => operation.trainIds.length > 0)
      .map((operation) => {
        const priorUse = operationUses.get(operation.id)!
          .filter((use) => use.trainId !== currentTrainId && use.timeSeconds <= eventSeconds)
          .sort((left, right) => right.timeSeconds - left.timeSeconds)[0]
        const lastTrain = priorUse ? trainById.get(priorUse.trainId) : undefined
        const endTime = lastTrain ? getTrainEndTime(lastTrain) : null
        return { operation, lastTrain, endSeconds: endTime ? timeToSeconds(endTime) : Number.POSITIVE_INFINITY }
      })
      .filter(({ lastTrain, endSeconds }) =>
        lastTrain &&
        lastTrain.id !== currentTrainId &&
        lastTrain.destinationStationId === stationId &&
        eventSeconds - endSeconds >= minimumTurnaroundSeconds,
      )
      .sort((left, right) => right.endSeconds - left.endSeconds || left.operation.id.localeCompare(right.operation.id))[0]
      ?.operation

  const events = trains.flatMap((train) => train.route.flatMap((point, routeIndex) => {
    if (!point.operationEvent) return []
    const eventTime = point.departureTime ?? point.arrivalTime
    if (!eventTime) {
      throw new OperationAssignmentError(
        `Operation event "${point.operationEvent.operationId}" on train "${train.id}" has no station time.`,
      )
    }
    return [{ train, point, event: point.operationEvent, eventTime, routeIndex }]
  })).sort((left, right) =>
    timeToSeconds(left.eventTime) - timeToSeconds(right.eventTime) ||
    left.train.id.localeCompare(right.train.id) ||
    left.routeIndex - right.routeIndex,
  )

  for (const { train, point, event, eventTime } of events) {
    if (event.type === 'combine') {
      const priorOperation = operationMap.has(event.operationId)
        ? undefined
        : findPriorOperation(point.stationId, timeToSeconds(eventTime), train.id)
      const operation = priorOperation
        ? renameOperation(priorOperation.id, event.operationId)
        : ensureOperation(event.operationId)
      const uses = operationUses.get(event.operationId)!
      const priorUses = uses
        .filter((use) => use.trainId !== train.id && use.timeSeconds <= timeToSeconds(eventTime))
        .sort((left, right) => right.timeSeconds - left.timeSeconds)
      const priorUse = priorUses[0]
      if (priorUse) {
        const priorTrain = trainById.get(priorUse.trainId)!
        const priorEndTime = getTrainEndTime(priorTrain)
        if (
          priorTrain.destinationStationId !== point.stationId ||
          !priorEndTime ||
          timeToSeconds(eventTime) - timeToSeconds(priorEndTime) < minimumTurnaroundSeconds
        ) {
          throw new OperationAssignmentError(
            `Operation "${event.operationId}" cannot combine into train "${train.id}" at station "${point.stationId}".`,
          )
        }
      }
      addUse(event.operationId, train, eventTime, point.stationId)
    } else {
      const operation = ensureOperation(event.operationId)
      addUse(event.operationId, train, eventTime, point.stationId)

      if (event.targetTrainId) {
        const targetTrain = trainById.get(event.targetTrainId)
        if (!targetTrain) {
          throw new OperationAssignmentError(
            `Split event on train "${train.id}" references unknown train "${event.targetTrainId}".`,
          )
        }
        const targetPoint = targetTrain.route.find((routePoint) => routePoint.stationId === point.stationId)
        const targetTime = targetPoint?.departureTime ?? targetPoint?.arrivalTime
        if (!targetPoint || !targetTime || timeToSeconds(targetTime) < timeToSeconds(eventTime)) {
          throw new OperationAssignmentError(
            `Split target train "${targetTrain.id}" must serve station "${point.stationId}" at or after the split.`,
          )
        }
        addUse(operation.id, targetTrain, eventTime, point.stationId)
      }
    }
  }

  for (const operation of operationMap.values()) {
    const uses = operationUses.get(operation.id)!
      .sort((left, right) => left.timeSeconds - right.timeSeconds || left.trainId.localeCompare(right.trainId))
    operation.trainIds = [...new Set(uses.map((use) => use.trainId))]
  }

  const operations = [...operationMap.values()].sort((left, right) => {
    const leftFirstUse = operationUses.get(left.id)![0]?.timeSeconds ?? Number.POSITIVE_INFINITY
    const rightFirstUse = operationUses.get(right.id)![0]?.timeSeconds ?? Number.POSITIVE_INFINITY
    return leftFirstUse - rightFirstUse || left.id.localeCompare(right.id)
  })

  return {
    ...data,
    trains,
    operations,
  }
}
