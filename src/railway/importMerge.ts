import type { Operation, ServiceRoute, Station, Train, VirtualRailwayData } from './types.ts'
import { serviceDaySeconds } from './time.ts'

function normalizedStationName(name: string): string {
  return name.normalize('NFKC').trim().toLocaleLowerCase()
}

function normalizedTrainNumber(trainNumber: string): string {
  return trainNumber.normalize('NFKC').trim()
}

export function hasSharedStationName(
  existing: Pick<VirtualRailwayData, 'stations'>,
  imported: Pick<VirtualRailwayData, 'stations'>,
): boolean {
  const existingNames = new Set(existing.stations.map(({ name }) => normalizedStationName(name)))
  return imported.stations.some(({ name }) => existingNames.has(normalizedStationName(name)))
}

function uniqueId(baseId: string, usedIds: Set<string>): string {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId)
    return baseId
  }
  let suffix = 2
  while (usedIds.has(`${baseId}-${suffix}`)) suffix += 1
  const id = `${baseId}-${suffix}`
  usedIds.add(id)
  return id
}

function mergeServiceRoutes(
  existing: ServiceRoute[],
  imported: ServiceRoute[],
  stationIds: Map<string, string>,
): { routes: ServiceRoute[]; importedRouteIds: Map<string, string> } {
  const usedIds = new Set(existing.map(({ id }) => id))
  const importedRouteIds = new Map<string, string>()
  const routes = imported.map((route) => {
    const id = uniqueId(route.id, usedIds)
    importedRouteIds.set(route.id, id)
    return {
      ...route,
      id,
      stationIds: route.stationIds.map((stationId) => stationIds.get(stationId) ?? stationId),
    }
  })
  return { routes: [...existing, ...routes], importedRouteIds }
}

function mergeOperations(
  existing: Operation[],
  imported: Operation[],
  trainIds: Map<string, string>,
): { operations: Operation[]; importedOperationIds: Map<string, string> } {
  const usedIds = new Set(existing.map(({ id }) => id))
  const importedOperationIds = new Map<string, string>()
  const operations = imported.map((operation) => {
    const id = uniqueId(operation.id, usedIds)
    importedOperationIds.set(operation.id, id)
    return {
      ...operation,
      id,
      trainIds: [...new Set(operation.trainIds.map((trainId) => trainIds.get(trainId) ?? trainId))],
    }
  })
  return { operations: [...existing, ...operations], importedOperationIds }
}

function getTrainStartClock(train: Train): string | undefined {
  const firstPoint = train.route.find(({ stationId }) => stationId === train.originStationId) ?? train.route[0]
  return firstPoint?.departureTime ?? firstPoint?.arrivalTime ?? undefined
}

function getTrainStartTime(train: Train): number {
  const time = getTrainStartClock(train)
  return time ? serviceDaySeconds(time) : Number.MAX_SAFE_INTEGER
}

function getTrainEndTime(train: Train): number {
  const lastPoint = train.route.at(-1)
  const time = lastPoint?.arrivalTime ?? lastPoint?.departureTime
  return time
    ? serviceDaySeconds(time, getTrainStartClock(train))
    : Number.MAX_SAFE_INTEGER
}

function orderConnectedTrainSegments(segments: Train[]): Train[][] {
  const remaining = [...segments].sort((first, second) =>
    getTrainStartTime(first) - getTrainStartTime(second),
  )
  const chains: Train[][] = []

  while (remaining.length) {
    const chain = [remaining.shift()!]
    while (true) {
      const lastTrain = chain.at(-1)!
      const lastStationId = lastTrain.route.at(-1)?.stationId
      const nextIndex = remaining.findIndex((train) =>
        lastStationId !== undefined &&
        train.route[0]?.stationId === lastStationId &&
        getTrainStartTime(train) >= getTrainEndTime(lastTrain),
      )
      if (nextIndex < 0) break
      chain.push(remaining.splice(nextIndex, 1)[0])
    }
    chains.push(chain)
  }

  return chains
}

function mergeTrainRoutes(segments: Train[]): Train['route'] {
  const route = segments.flatMap(({ route: segmentRoute }) => segmentRoute)

  return route.reduce<Train['route']>((mergedRoute, point) => {
    const previousPoint = mergedRoute.at(-1)
    if (
      previousPoint?.stationId === point.stationId &&
      previousPoint.arrivalTime !== null &&
      previousPoint.departureTime === null &&
      point.arrivalTime === null &&
      point.departureTime !== null &&
      (!previousPoint.operationEvent || !point.operationEvent)
    ) {
      mergedRoute[mergedRoute.length - 1] = {
        ...previousPoint,
        ...point,
        arrivalTime: previousPoint.arrivalTime,
        operationEvent: previousPoint.operationEvent ?? point.operationEvent,
      }
    } else {
      mergedRoute.push(point)
    }
    return mergedRoute
  }, [])
}

export function mergeImportedRailway(
  existing: VirtualRailwayData,
  imported: VirtualRailwayData,
): VirtualRailwayData {
  const stations = [...existing.stations]
  const existingStationByName = new Map(
    stations.map((station) => [normalizedStationName(station.name), station]),
  )
  const usedStationIds = new Set(stations.map(({ id }) => id))
  const importedStationIds = new Map<string, string>()

  for (const station of imported.stations) {
    const existingStation = existingStationByName.get(normalizedStationName(station.name))
    if (existingStation) {
      importedStationIds.set(station.id, existingStation.id)
      continue
    }
    const id = uniqueId(station.id, usedStationIds)
    const mergedStation: Station = { ...station, id }
    stations.push(mergedStation)
    existingStationByName.set(normalizedStationName(station.name), mergedStation)
    importedStationIds.set(station.id, id)
  }

  const { routes: serviceRoutes, importedRouteIds } = mergeServiceRoutes(
    existing.serviceRoutes ?? [],
    imported.serviceRoutes ?? [],
    importedStationIds,
  )

  const usedTrainIds = new Set(existing.trains.map(({ id }) => id))
  const existingTrainIds = new Map<string, string>()
  const importedTrainIds = new Map<string, string>()
  const importedTrainIdBySourceId = new Map<string, string>()
  for (const train of imported.trains) {
    importedTrainIdBySourceId.set(train.id, uniqueId(train.id, usedTrainIds))
  }

  const trainSegments = [
    ...existing.trains.map((train) => ({ train, source: 'existing' as const, originalId: train.id })),
    ...imported.trains.map((train) => ({
      train: {
        ...train,
        id: importedTrainIdBySourceId.get(train.id)!,
        originStationId: importedStationIds.get(train.originStationId) ?? train.originStationId,
        destinationStationId: importedStationIds.get(train.destinationStationId) ?? train.destinationStationId,
        route: train.route.map((point) => ({
          ...point,
          stationId: importedStationIds.get(point.stationId) ?? point.stationId,
        })),
      },
      source: 'imported' as const,
      originalId: train.id,
    })),
  ]
  const segmentsByTrainNumber = new Map<string, typeof trainSegments>()
  for (const segment of trainSegments) {
    const trainNumber = normalizedTrainNumber(segment.train.trainNumber)
    const key = trainNumber ? `number:${trainNumber}` : `id:${segment.train.id}`
    const group = segmentsByTrainNumber.get(key) ?? []
    group.push(segment)
    segmentsByTrainNumber.set(key, group)
  }

  const orderedTrainGroups: Array<{ id: string; segments: typeof trainSegments }> = []
  for (const segments of segmentsByTrainNumber.values()) {
    const chains = orderConnectedTrainSegments(segments.map(({ train }) => train))
    for (const chain of chains) {
      const chainSegments = chain.map((train) => segments.find((segment) => segment.train === train)!)
      const existingSegment = chainSegments.find(({ source }) => source === 'existing')
      const id = existingSegment?.train.id ?? chain[0].id
      for (const segment of chainSegments) {
        if (segment.source === 'existing') existingTrainIds.set(segment.originalId, id)
        else importedTrainIds.set(segment.originalId, id)
      }
      orderedTrainGroups.push({ id, segments: chainSegments })
    }
  }

  const { operations, importedOperationIds } = mergeOperations(
    existing.operations,
    imported.operations,
    importedTrainIds,
  )
  const mergedOperations = [
    ...existing.operations.map((operation) => ({
      ...operation,
      trainIds: [...new Set(operation.trainIds.map((trainId) => existingTrainIds.get(trainId) ?? trainId))],
    })),
    ...operations.slice(existing.operations.length),
  ]

  const trains: Train[] = orderedTrainGroups.map(({ id, segments }) => {
    const orderedSegments = segments.map(({ train, source }) => source === 'existing'
      ? {
          ...train,
          id,
          route: train.route.map((point) => ({
            ...point,
            operationEvent: point.operationEvent
              ? {
                  ...point.operationEvent,
                  targetTrainId: point.operationEvent.targetTrainId
                    ? existingTrainIds.get(point.operationEvent.targetTrainId) ??
                      importedTrainIds.get(point.operationEvent.targetTrainId) ??
                      point.operationEvent.targetTrainId
                    : null,
                }
              : null,
          })),
        }
      : {
          ...train,
          id,
          serviceRouteId: train.serviceRouteId
            ? importedRouteIds.get(train.serviceRouteId) ?? train.serviceRouteId
            : undefined,
          currentOperationIds: train.currentOperationIds.map((operationId) =>
            importedOperationIds.get(operationId) ?? operationId,
          ),
          route: train.route.map((point) => ({
            ...point,
            operationEvent: point.operationEvent
              ? {
                  ...point.operationEvent,
                  operationId: importedOperationIds.get(point.operationEvent.operationId) ??
                    point.operationEvent.operationId,
                  targetTrainId: point.operationEvent.targetTrainId
                    ? importedTrainIds.get(point.operationEvent.targetTrainId) ??
                      point.operationEvent.targetTrainId
                    : null,
                }
              : null,
          })),
        })
    const firstTrain = orderedSegments.find((_, index) => segments[index].source === 'existing') ?? orderedSegments[0]
    const route = mergeTrainRoutes(orderedSegments)
    return {
      ...firstTrain,
      id,
      currentOperationIds: [...new Set(orderedSegments.flatMap(({ currentOperationIds }) => currentOperationIds))],
      originStationId: route[0]?.stationId ?? firstTrain.originStationId,
      destinationStationId: route.at(-1)?.stationId ?? firstTrain.destinationStationId,
      route,
      isDepotIn: orderedSegments[0].isDepotIn,
      isDepotOut: orderedSegments.at(-1)!.isDepotOut,
    }
  })

  return {
    ...existing,
    stations,
    serviceRoutes,
    trainTypes: [...new Set([...(existing.trainTypes ?? []), ...(imported.trainTypes ?? [])])],
    trainTypeColors: { ...imported.trainTypeColors, ...existing.trainTypeColors },
    trainTypeTextColors: { ...imported.trainTypeTextColors, ...existing.trainTypeTextColors },
    trains,
    operations: mergedOperations,
  }
}
