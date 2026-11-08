import { getTrainEndTime, getTrainStartTime, timeToSeconds } from './time.ts'
import type { Train, ValidationIssue, VirtualRailwayData } from './types.ts'

export interface RailwayValidationOptions {
  expectedCarCounts?: Record<string, number>
}

function issue(
  code: string,
  message: string,
  entityIds: string[],
  severity: ValidationIssue['severity'] = 'error',
): ValidationIssue {
  return { code, severity, message, entityIds }
}

function safeSeconds(time: string | null): number | null {
  if (time === null) return null
  try {
    return timeToSeconds(time)
  } catch {
    return null
  }
}

function hasOverlappingIntervals(
  first: { start: number; end: number },
  second: { start: number; end: number },
): boolean {
  return first.start <= second.end && second.start <= first.end
}

export function validateRailway(
  data: VirtualRailwayData,
  options: RailwayValidationOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const stationIds = new Set(data.stations.map((station) => station.id))
  const trainById = new Map(data.trains.map((train) => [train.id, train]))
  const operationById = new Map(data.operations.map((operation) => [operation.id, operation]))
  const serviceRoutes = data.serviceRoutes ?? []
  const serviceRouteById = new Map(serviceRoutes.map((route) => [route.id, route]))

  if (stationIds.size !== data.stations.length) {
    issues.push(issue('station.duplicate-id', 'Station IDs must be unique.', []))
  }
  if (trainById.size !== data.trains.length) {
    issues.push(issue('train.duplicate-id', 'Train IDs must be unique.', []))
  }
  if (operationById.size !== data.operations.length) {
    issues.push(issue('operation.duplicate-id', 'Operation IDs must be unique.', []))
  }

  if (serviceRouteById.size !== serviceRoutes.length) {
    issues.push(issue('service-route.duplicate-id', 'Service route IDs must be unique.', []))
  }
  for (const serviceRoute of serviceRoutes) {
    if (serviceRoute.stationIds.length < 2) {
      issues.push(issue('service-route.too-short', `Service route "${serviceRoute.id}" must include at least two stations.`, [serviceRoute.id]))
    }
    for (let index = 0; index < serviceRoute.stationIds.length; index += 1) {
      const stationId = serviceRoute.stationIds[index]
      if (!stationIds.has(stationId)) {
        issues.push(issue(
          'network.unknown-service-route-station',
          `Service route "${serviceRoute.id}" references unknown station "${stationId}".`,
          [serviceRoute.id, stationId],
        ))
      }
    }
  }

  for (const train of data.trains) {
    if (train.serviceRouteId) {
      const serviceRoute = serviceRouteById.get(train.serviceRouteId)
      if (!serviceRoute) {
        issues.push(issue(
          'train.unknown-service-route',
          `Train "${train.id}" references unknown service route "${train.serviceRouteId}".`,
          [train.id, train.serviceRouteId],
        ))
      } else {
        let nextRouteIndex = 0
        const followsServiceRoute = train.route.every((point) => {
          const stationIndex = serviceRoute.stationIds.indexOf(point.stationId, nextRouteIndex)
          if (stationIndex < 0) return false
          nextRouteIndex = stationIndex + 1
          return true
        })
        if (!followsServiceRoute) {
          issues.push(issue(
            'train.service-route-mismatch',
            `Train "${train.id}" does not follow service route "${serviceRoute.id}".`,
            [train.id, serviceRoute.id],
          ))
        }
      }
    }
    if (!stationIds.has(train.originStationId)) {
      issues.push(issue('train.unknown-origin', `Train "${train.id}" has an unknown origin station.`, [train.id]))
    }
    if (!stationIds.has(train.destinationStationId)) {
      issues.push(issue('train.unknown-destination', `Train "${train.id}" has an unknown destination station.`, [train.id]))
    }
    if (!train.route.some((point) => point.stationId === train.originStationId)) {
      issues.push(issue('train.origin-not-in-route', `Train "${train.id}" route does not include its origin.`, [train.id]))
    }
    if (!train.route.some((point) => point.stationId === train.destinationStationId)) {
      issues.push(issue('train.destination-not-in-route', `Train "${train.id}" route does not include its destination.`, [train.id]))
    }
    let previousTime: number | null = null
    for (const point of train.route) {
      if (!stationIds.has(point.stationId)) {
        issues.push(issue(
          'train.unknown-route-station',
          `Train "${train.id}" route references unknown station "${point.stationId}".`,
          [train.id, point.stationId],
        ))
      }
      const arrival = safeSeconds(point.arrivalTime)
      const departure = safeSeconds(point.departureTime)
      if (point.arrivalTime !== null && arrival === null) {
        issues.push(issue('train.invalid-arrival-time', `Train "${train.id}" has an invalid arrival time.`, [train.id]))
      }
      if (point.departureTime !== null && departure === null) {
        issues.push(issue('train.invalid-departure-time', `Train "${train.id}" has an invalid departure time.`, [train.id]))
      }
      if (arrival !== null && departure !== null && departure < arrival) {
        issues.push(issue('train.departure-before-arrival', `Train "${train.id}" departs before arriving.`, [train.id]))
      }
      if (point.isPassing && (
        (arrival === null) !== (departure === null) ||
        (arrival !== null && departure !== null && arrival !== departure)
      )) {
        issues.push(issue(
          'train.invalid-passing-time',
          `Train "${train.id}" must have one identical arrival/departure time at a passing station.`,
          [train.id, point.stationId],
        ))
      }
      const firstTime = arrival ?? departure
      const lastTime = departure ?? arrival
      if (firstTime !== null && previousTime !== null && firstTime < previousTime) {
        issues.push(issue('train.route-time-reversal', `Train "${train.id}" route times are not chronological.`, [train.id]))
      }
      if (lastTime !== null) previousTime = lastTime
      if (point.operationEvent) {
        if (!operationById.has(point.operationEvent.operationId)) {
          issues.push(issue(
            'operation.event-unknown-operation',
            `Train "${train.id}" has an event for unknown operation "${point.operationEvent.operationId}".`,
            [train.id, point.operationEvent.operationId],
          ))
        }
        if (point.operationEvent.targetTrainId && !trainById.has(point.operationEvent.targetTrainId)) {
          issues.push(issue(
            'operation.event-unknown-target',
            `Train "${train.id}" has an event for unknown target train "${point.operationEvent.targetTrainId}".`,
            [train.id, point.operationEvent.targetTrainId],
          ))
        }
      }
    }

    if (new Set(train.currentOperationIds).size !== train.currentOperationIds.length) {
      issues.push(issue('train.duplicate-operation', `Train "${train.id}" lists an operation more than once.`, [train.id]))
    }
    for (const operationId of train.currentOperationIds) {
      const operation = operationById.get(operationId)
      if (!operation) {
        issues.push(issue(
          'train.unknown-operation',
          `Train "${train.id}" references unknown operation "${operationId}".`,
          [train.id, operationId],
        ))
      } else if (!operation.trainIds.includes(train.id)) {
        issues.push(issue(
          'operation.membership-mismatch',
          `Operation "${operationId}" does not list train "${train.id}".`,
          [operationId, train.id],
        ))
      }
    }
  }

  for (const operation of data.operations) {
    if (!Number.isInteger(operation.carCount) || operation.carCount <= 0) {
      issues.push(issue('operation.invalid-car-count', `Operation "${operation.id}" must have a positive car count.`, [operation.id]))
    }
    if (new Set(operation.trainIds).size !== operation.trainIds.length) {
      issues.push(issue('operation.duplicate-train', `Operation "${operation.id}" lists a train more than once.`, [operation.id]))
    }
    for (const trainId of operation.trainIds) {
      const train = trainById.get(trainId)
      if (!train) {
        issues.push(issue(
          'operation.unknown-train',
          `Operation "${operation.id}" references unknown train "${trainId}".`,
          [operation.id, trainId],
        ))
      } else if (!train.currentOperationIds.includes(operation.id)) {
        issues.push(issue(
          'operation.membership-mismatch',
          `Train "${trainId}" does not list operation "${operation.id}".`,
          [operation.id, trainId],
        ))
      }
    }
  }

  validateTrackConflicts(data.trains, issues)
  validateCarCounts(data, options.expectedCarCounts ?? {}, issues)
  validateTeleportation(data, issues)

  return issues
}

function validateTrackConflicts(trains: Train[], issues: ValidationIssue[]) {
  const occupancyByStation = new Map<string, Array<{
    trainId: string
    trackNumber: string
    start: number
    end: number
  }>>()

  for (const train of trains) {
    for (const point of train.route) {
      if (!point.trackNumber) continue
      const arrival = safeSeconds(point.arrivalTime)
      const departure = safeSeconds(point.departureTime)
      const start = arrival ?? departure
      const end = departure ?? arrival
      if (start === null || end === null) continue
      const occupancy = occupancyByStation.get(point.stationId) ?? []
      occupancy.push({ trainId: train.id, trackNumber: point.trackNumber, start, end })
      occupancyByStation.set(point.stationId, occupancy)
    }
  }

  for (const [stationId, occupancies] of occupancyByStation) {
    for (let firstIndex = 0; firstIndex < occupancies.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < occupancies.length; secondIndex += 1) {
        const first = occupancies[firstIndex]
        const second = occupancies[secondIndex]
        if (
          first.trainId !== second.trainId &&
          first.trackNumber === second.trackNumber &&
          hasOverlappingIntervals(first, second)
        ) {
          issues.push(issue(
            'track.conflict',
            `Trains "${first.trainId}" and "${second.trainId}" occupy track "${first.trackNumber}" at station "${stationId}" at the same time.`,
            [first.trainId, second.trainId, stationId],
          ))
        }
      }
    }
  }
}

function validateCarCounts(
  data: VirtualRailwayData,
  expectedCarCounts: Record<string, number>,
  issues: ValidationIssue[],
) {
  const operationById = new Map(data.operations.map((operation) => [operation.id, operation]))
  for (const train of data.trains) {
    const expected = expectedCarCounts[train.id]
    if (expected === undefined) continue
    if (!Number.isInteger(expected) || expected <= 0) {
      issues.push(issue('train.invalid-expected-car-count', `Expected car count for "${train.id}" must be a positive integer.`, [train.id]))
      continue
    }
    const actual = train.currentOperationIds.reduce(
      (total, operationId) => total + (operationById.get(operationId)?.carCount ?? 0),
      0,
    )
    if (actual !== expected) {
      issues.push(issue(
        'operation.car-count-mismatch',
        `Train "${train.id}" carries ${actual} cars but is expected to carry ${expected}.`,
        [train.id, ...train.currentOperationIds],
      ))
    }
  }
}

function validateTeleportation(data: VirtualRailwayData, issues: ValidationIssue[]) {
  const trainById = new Map(data.trains.map((train) => [train.id, train]))
  const transferStationByOperationAndTrain = new Map<string, string>()
  for (const train of data.trains) {
    for (const point of train.route) {
      const event = point.operationEvent
      if (event?.type === 'split' && event.targetTrainId) {
        const key = JSON.stringify([event.operationId, event.targetTrainId])
        transferStationByOperationAndTrain.set(key, point.stationId)
      }
    }
  }

  for (const operation of data.operations) {
    for (let index = 0; index < operation.trainIds.length - 1; index += 1) {
      const previous = trainById.get(operation.trainIds[index])
      const next = trainById.get(operation.trainIds[index + 1])
      if (!previous || !next) continue

      const splitPoint = previous.route.find((point) =>
        point.operationEvent?.type === 'split' && point.operationEvent.operationId === operation.id,
      )
      const combinePoint = next.route.find((point) =>
        point.operationEvent?.type === 'combine' && point.operationEvent.operationId === operation.id,
      )
      const previousStationId = splitPoint?.stationId ?? previous.destinationStationId
      const transferStationId = transferStationByOperationAndTrain.get(JSON.stringify([operation.id, next.id]))
      const nextStationId = combinePoint?.stationId ?? transferStationId ?? next.originStationId

      if (previousStationId === nextStationId) continue
      if (previous.isDepotIn || next.isDepotOut) continue
      issues.push(issue(
        'operation.teleportation',
        `Operation "${operation.id}" moves from "${previousStationId}" to "${nextStationId}" without a connecting train or depot movement.`,
        [operation.id, previous.id, next.id],
      ))
    }
  }
}

export function getTrainTiming(train: Train): { start: number | null; end: number | null } {
  return {
    start: safeSeconds(getTrainStartTime(train)),
    end: safeSeconds(getTrainEndTime(train)),
  }
}
