import type { Line, Operation, ServiceRoute, Station, TrackConnection, Train, VirtualRailwayData } from './types.ts'

function normalizedStationName(name: string): string {
  return name.normalize('NFKC').trim().toLocaleLowerCase()
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

function mergeLines(existing: Line[], imported: Line[], stationIds: Map<string, string>): Line[] {
  const usedIds = new Set(existing.map(({ id }) => id))
  return [
    ...existing,
    ...imported.map((line) => ({
      ...line,
      id: uniqueId(line.id, usedIds),
      stations: line.stations.map((stationId) => stationIds.get(stationId) ?? stationId),
    })),
  ]
}

function mergeTrackConnections(
  existing: TrackConnection[],
  imported: TrackConnection[],
  stationIds: Map<string, string>,
): TrackConnection[] {
  const result = [...existing]
  const pairs = new Set(result.map(({ fromStationId, toStationId }) =>
    [fromStationId, toStationId].sort().join('\u0000'),
  ))
  const usedIds = new Set(result.map(({ id }) => id))
  for (const connection of imported) {
    const fromStationId = stationIds.get(connection.fromStationId) ?? connection.fromStationId
    const toStationId = stationIds.get(connection.toStationId) ?? connection.toStationId
    if (fromStationId === toStationId) continue
    const pair = [fromStationId, toStationId].sort().join('\u0000')
    if (pairs.has(pair)) continue
    pairs.add(pair)
    result.push({
      ...connection,
      id: uniqueId(connection.id, usedIds),
      fromStationId,
      toStationId,
    })
  }
  return result
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
      trainIds: operation.trainIds.map((trainId) => trainIds.get(trainId) ?? trainId),
    }
  })
  return { operations: [...existing, ...operations], importedOperationIds }
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

  const lines = mergeLines(existing.lines ?? [], imported.lines ?? [], importedStationIds)
  const trackConnections = mergeTrackConnections(
    existing.trackConnections ?? [],
    imported.trackConnections ?? [],
    importedStationIds,
  )
  const { routes: serviceRoutes, importedRouteIds } = mergeServiceRoutes(
    existing.serviceRoutes ?? [],
    imported.serviceRoutes ?? [],
    importedStationIds,
  )

  const usedTrainIds = new Set(existing.trains.map(({ id }) => id))
  const importedTrainIds = new Map<string, string>()
  const importedTrains = imported.trains.map((train) => {
    const id = uniqueId(train.id, usedTrainIds)
    importedTrainIds.set(train.id, id)
    return { ...train, id }
  })
  const { operations, importedOperationIds } = mergeOperations(
    existing.operations,
    imported.operations,
    importedTrainIds,
  )
  const trains: Train[] = importedTrains.map((train) => ({
    ...train,
    serviceRouteId: train.serviceRouteId
      ? importedRouteIds.get(train.serviceRouteId) ?? train.serviceRouteId
      : undefined,
    currentOperationIds: train.currentOperationIds.map((id) => importedOperationIds.get(id) ?? id),
    originStationId: importedStationIds.get(train.originStationId) ?? train.originStationId,
    destinationStationId: importedStationIds.get(train.destinationStationId) ?? train.destinationStationId,
    route: train.route.map((point) => ({
      ...point,
      stationId: importedStationIds.get(point.stationId) ?? point.stationId,
      operationEvent: point.operationEvent
        ? {
            ...point.operationEvent,
            operationId: importedOperationIds.get(point.operationEvent.operationId) ?? point.operationEvent.operationId,
            targetTrainId: point.operationEvent.targetTrainId
              ? importedTrainIds.get(point.operationEvent.targetTrainId) ?? point.operationEvent.targetTrainId
              : null,
          }
        : null,
    })),
  }))

  return {
    ...existing,
    stations,
    lines,
    trackConnections,
    serviceRoutes,
    trainTypes: [...new Set([...(existing.trainTypes ?? []), ...(imported.trainTypes ?? [])])],
    trains: [...existing.trains, ...trains],
    operations: [...operations],
  }
}
