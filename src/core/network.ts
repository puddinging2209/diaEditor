import type { Line, ServiceRoute, TrackConnection } from './types.ts'

export function deriveTrackConnections(
  routes: Array<{ id: string; stationIds: string[] }>,
): TrackConnection[] {
  const connections = new Map<string, TrackConnection>()

  for (const route of routes) {
    for (let index = 1; index < route.stationIds.length; index += 1) {
      const fromStationId = route.stationIds[index - 1]
      const toStationId = route.stationIds[index]
      if (fromStationId === toStationId) continue
      const key = [fromStationId, toStationId].sort().join('\u0000')
      if (connections.has(key)) continue
      connections.set(key, {
        id: `connection-${connections.size + 1}`,
        fromStationId,
        toStationId,
        trackCount: 2,
      })
    }
  }

  return [...connections.values()]
}

export function deriveNetworkFromLines(lines: Line[]): {
  trackConnections: TrackConnection[]
  serviceRoutes: ServiceRoute[]
} {
  return {
    trackConnections: deriveTrackConnections(lines.map(({ id, stations }) => ({ id, stationIds: stations }))),
    serviceRoutes: lines.map((line) => ({
      id: `system-${line.id}`,
      name: line.name,
      stationIds: [...line.stations],
    })),
  }
}
