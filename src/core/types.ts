export interface Station {
  id: string
  name: string
  kilopost: number
  hasTracks: boolean
  canTurnBack: boolean
  isDepot: boolean
  depotCapacity: number | null
}

export interface Line {
  id: string
  name: string
  stations: string[]
}

export interface TrackConnection {
  id: string
  fromStationId: string
  toStationId: string
  trackCount: 1 | 2
}

export interface ServiceRoute {
  id: string
  name: string
  stationIds: string[]
}

export type TrainType = 'Local' | 'Express' | 'LimitedExpress' | 'OutofService'

export interface OperationEvent {
  type: 'combine' | 'split'
  operationId: string
  targetTrainId: string | null
}

export interface TrainRoutePoint {
  stationId: string
  arrivalTime: string | null
  departureTime: string | null
  trackNumber: string
  operationEvent: OperationEvent | null
}

export interface Train {
  id: string
  trainNumber: string
  type: TrainType
  trainName?: string
  typeName?: string
  carCount?: number
  serviceRouteId?: string
  currentOperationIds: string[]
  originStationId: string
  destinationStationId: string
  route: TrainRoutePoint[]
  isDepotIn: boolean
  isDepotOut: boolean
}

export interface Operation {
  id: string
  carCount: number
  trainIds: string[]
}

export interface VirtualRailwayData {
  version: '1.0.0'
  railwayName: string
  lines?: Line[]
  stations: Station[]
  trains: Train[]
  operations: Operation[]
  trainTypes?: string[]
  trackConnections?: TrackConnection[]
  serviceRoutes?: ServiceRoute[]
}

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationIssue {
  code: string
  severity: ValidationSeverity
  message: string
  entityIds: string[]
}
