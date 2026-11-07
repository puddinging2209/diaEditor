import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assignOperations,
  digitsToTime,
  exportRailwayJson,
  generatePatternTrains,
  hasSharedStationName,
  importRailwayJson,
  mergeImportedRailway,
  OperationAssignmentError,
  validateRailway,
  validateVirtualRailwayShape,
} from '../index.ts'

const stations = ['A', 'B', 'C', 'D', 'E'].map((id, index) => ({
  id,
  name: `Station ${id}`,
  kilopost: index * 5,
  hasTracks: true,
  canTurnBack: false,
  isDepot: false,
  depotCapacity: null,
}))

function train(id, originStationId, destinationStationId, route, extra = {}) {
  return {
    id,
    trainNumber: id,
    type: 'Local',
    currentOperationIds: [],
    originStationId,
    destinationStationId,
    route,
    isDepotIn: false,
    isDepotOut: false,
    ...extra,
  }
}

function point(stationId, arrivalTime, departureTime, operationEvent = null, trackNumber = '1') {
  return { stationId, arrivalTime, departureTime, trackNumber, operationEvent }
}

test('assigns consecutive trips and observes the minimum turnaround', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Test Railway',
    lines: [],
    stations,
    trains: [
      train('T1', 'A', 'B', [point('A', null, '08:00:00'), point('B', '08:20:00', null)]),
      train('T2', 'B', 'C', [point('B', null, '08:23:00'), point('C', '08:45:00', null)]),
      train('T3', 'C', 'D', [point('C', null, '08:47:00'), point('D', '09:00:00', null)]),
    ],
    operations: [{ id: 'old', carCount: 6, trainIds: [] }],
  }

  const assigned = assignOperations(data, { defaultCarCount: 6 })

  assert.deepEqual(assigned.operations.map(({ id, trainIds }) => ({ id, trainIds })), [
    { id: 'AUTO-001', trainIds: ['T1', 'T2'] },
    { id: 'AUTO-002', trainIds: ['T3'] },
  ])
  assert.deepEqual(assigned.trains.map((item) => item.currentOperationIds), [
    ['AUTO-001'],
    ['AUTO-001'],
    ['AUTO-002'],
  ])
  assert.deepEqual(data.trains.map((item) => item.currentOperationIds), [[], [], []])
})

test('converts six-digit time input into HH:MM:SS', () => {
  assert.equal(digitsToTime('101015'), '10:10:15')
  assert.equal(digitsToTime('080005'), '08:00:05')
  assert.throws(() => digitsToTime('106015'), /Minutes and seconds/)
  assert.throws(() => digitsToTime('1010'), /six digits/)
})

test('merges an imported timetable as a system without replacing existing stations or operations', () => {
  const existing = {
    version: '1.0.0',
    railwayName: 'Existing Railway',
    lines: [{ id: 'main', name: 'Main', stations: ['A', 'B'] }],
    stations: [
      { ...stations[0], id: 'existing-alpha', name: 'Alpha', kilopost: 42, isDepot: true },
      { ...stations[1], id: 'existing-beta', name: 'Beta' },
    ],
    trackConnections: [{
      id: 'existing-connection',
      fromStationId: 'existing-alpha',
      toStationId: 'existing-beta',
      trackCount: 1,
    }],
    serviceRoutes: [{ id: 'system-main', name: 'Existing Main', stationIds: ['existing-alpha', 'existing-beta'] }],
    trains: [train('T1', 'existing-alpha', 'existing-beta', [
      point('existing-alpha', null, '07:00:00'),
      point('existing-beta', '07:20:00', null),
    ], { currentOperationIds: ['AUTO-001'] })],
    operations: [{ id: 'AUTO-001', carCount: 6, trainIds: ['T1'] }],
    trainTypes: ['普通'],
  }
  const imported = {
    version: '1.0.0',
    railwayName: 'Imported Branch',
    lines: [{ id: 'main', name: 'Imported Branch', stations: ['alpha', 'beta', 'gamma'] }],
    stations: [
      { ...stations[0], id: 'alpha', name: 'Alpha', kilopost: 0 },
      { ...stations[1], id: 'beta', name: 'Beta', kilopost: 1 },
      { ...stations[2], id: 'gamma', name: 'Gamma', kilopost: 2 },
    ],
    trackConnections: [
      { id: 'connection-1', fromStationId: 'alpha', toStationId: 'beta', trackCount: 2 },
      { id: 'connection-2', fromStationId: 'beta', toStationId: 'gamma', trackCount: 2 },
    ],
    serviceRoutes: [{ id: 'system-main', name: 'Imported Branch', stationIds: ['alpha', 'beta', 'gamma'] }],
    trains: [train('T1', 'alpha', 'gamma', [
      point('alpha', null, '08:00:00'),
      point('beta', '08:10:00', '08:11:00'),
      point('gamma', '08:20:00', null),
    ], { currentOperationIds: ['AUTO-001'], serviceRouteId: 'system-main' })],
    operations: [{ id: 'AUTO-001', carCount: 4, trainIds: ['T1'] }],
    trainTypes: ['快速'],
  }

  const merged = mergeImportedRailway(existing, imported)
  assert.equal(merged.railwayName, 'Existing Railway')
  assert.equal(merged.stations.length, 3)
  assert.equal(merged.stations[0].id, 'existing-alpha')
  assert.equal(merged.stations[0].kilopost, 42)
  assert.equal(merged.stations[0].isDepot, true)
  assert.deepEqual(merged.lines.map(({ id }) => id), ['main', 'main-2'])
  assert.deepEqual(merged.lines[1].stations, ['existing-alpha', 'existing-beta', 'gamma'])
  assert.equal(merged.trackConnections.length, 2)
  assert.deepEqual(merged.serviceRoutes[1].stationIds, ['existing-alpha', 'existing-beta', 'gamma'])
  assert.equal(merged.trains[0].id, 'T1')
  assert.equal(merged.trains[1].id, 'T1-2')
  assert.deepEqual(merged.trains[1].route.map(({ stationId }) => stationId), [
    'existing-alpha',
    'existing-beta',
    'gamma',
  ])
  assert.deepEqual(merged.trains[1].currentOperationIds, ['AUTO-001-2'])
  assert.equal(merged.trains[1].serviceRouteId, 'system-main-2')
  assert.deepEqual(merged.operations.map(({ id, trainIds }) => [id, trainIds]), [
    ['AUTO-001', ['T1']],
    ['AUTO-001-2', ['T1-2']],
  ])
  assert.deepEqual(merged.trainTypes, ['普通', '快速'])
})

test('detects shared station names using the same normalization as import merging', () => {
  const existing = { stations: [{ ...stations[0], name: ' ＡＬＰＨＡ ' }] }
  assert.equal(hasSharedStationName(existing, { stations: [{ ...stations[1], name: 'alpha' }] }), true)
  assert.equal(hasSharedStationName(existing, { stations: [{ ...stations[1], name: 'Beta' }] }), false)
  assert.equal(hasSharedStationName({ stations: [] }, { stations: [{ ...stations[1], name: 'Beta' }] }), false)
})

test('links a combining operation through a split target train', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Test Railway',
    lines: [],
    stations,
    trains: [
      train('feeder', 'A', 'B', [point('A', null, '08:00:00'), point('B', '08:30:00', null)]),
      train('combined', 'D', 'C', [
        point('D', null, '08:40:00'),
        point('B', '09:00:00', '09:05:00', { type: 'combine', operationId: 'OP001', targetTrainId: null }),
        point('C', '09:20:00', null, { type: 'split', operationId: 'OP001', targetTrainId: 'continuation' }),
      ]),
      train('continuation', 'C', 'E', [point('C', null, '09:25:00'), point('E', '09:50:00', null)]),
    ],
    operations: [],
  }

  const assigned = assignOperations(data, {
    defaultCarCount: 4,
    operationCarCounts: { OP001: 4 },
  })

  const joined = assigned.operations.find((operation) => operation.id === 'OP001')
  assert.equal(joined.carCount, 4)
  assert.deepEqual(joined.trainIds, ['feeder', 'combined', 'continuation'])
  assert.ok(assigned.trains.find((item) => item.id === 'combined').currentOperationIds.includes('OP001'))
  assert.ok(assigned.trains.find((item) => item.id === 'continuation').currentOperationIds.includes('OP001'))
  assert.deepEqual(validateRailway(assigned), [])
  assert.throws(() => assignOperations(data, {
    defaultCarCount: 4,
    expectedCarCounts: { combined: 7 },
  }), OperationAssignmentError)
})

test('rejects a split target that does not serve the split station', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Test Railway',
    lines: [],
    stations,
    trains: [
      train('source', 'A', 'B', [
        point('A', null, '08:00:00'),
        point('B', '08:30:00', null, { type: 'split', operationId: 'OP001', targetTrainId: 'target' }),
      ]),
      train('target', 'C', 'D', [point('C', null, '08:35:00'), point('D', '08:50:00', null)]),
    ],
    operations: [],
  }

  assert.throws(() => assignOperations(data), OperationAssignmentError)
})

test('expands pattern times and applies cycle-based train numbering', () => {
  const template = train('local', 'A', 'B', [
    point('A', null, '00:00:00'),
    point('B', '00:20:00', null),
  ])

  const generated = generatePatternTrains([template], {
    startTime: '10:00:00',
    endTime: '10:40:00',
    intervalMinutes: 20,
    numberingRules: {
      Local: { prefix: '', firstNumber: 1001, increment: 2, suffix: 'M', width: 4 },
    },
  })

  assert.deepEqual(generated.map(({ id, trainNumber }) => [id, trainNumber]), [
    ['local-1', '1001M'],
    ['local-2', '1003M'],
    ['local-3', '1005M'],
  ])
  assert.equal(generated[1].route[1].arrivalTime, '10:40:00')
})

test('exports and imports schema-valid JSON and rejects unknown fields', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Test Railway',
    lines: [],
    stations,
    trains: [
      train('named', 'A', 'C', [
        point('A', null, '08:00:00'),
        { ...point('B', '08:10:00', '08:10:00'), isPassing: true },
        point('C', '08:20:00', null),
      ], { trainName: 'Test Express', typeName: '特急', carCount: 8, serviceRouteId: 'system-main' }),
    ],
    operations: [],
    trainTypes: ['普通', '特急'],
    trackConnections: [
      { id: 'AB', fromStationId: 'A', toStationId: 'B', trackCount: 2 },
      { id: 'BC', fromStationId: 'B', toStationId: 'C', trackCount: 2 },
    ],
    serviceRoutes: [{ id: 'system-main', name: 'Main System', stationIds: ['A', 'B', 'C'] }],
  }

  assert.deepEqual(importRailwayJson(exportRailwayJson(data)), data)
  const optionalTrainFields = { ...data, trains: [train('minimal', 'A', 'B', [
    point('A', null, '08:00:00'),
    point('B', '08:20:00', null),
  ])] }
  assert.deepEqual(importRailwayJson(exportRailwayJson(optionalTrainFields)), optionalTrainFields)
  const parsedStyleOptionalFields = {
    ...optionalTrainFields,
    trains: [train('parsed', 'A', 'B', [
      point('A', null, '08:00:00'),
      point('B', '08:20:00', null),
    ], { trainName: undefined, typeName: undefined, carCount: undefined, serviceRouteId: undefined })],
  }
  assert.deepEqual(validateVirtualRailwayShape(parsedStyleOptionalFields), [])
  const graphOnly = { ...data }
  delete graphOnly.lines
  assert.deepEqual(importRailwayJson(exportRailwayJson(graphOnly)), graphOnly)
  assert.throws(() => importRailwayJson(JSON.stringify({ ...data, extra: true })), /schema/)
  assert.throws(() => importRailwayJson(JSON.stringify({
    ...data,
    trains: [{ ...data.trains[0], carCount: 0 }],
  })), /schema/)
  assert.throws(() => importRailwayJson(JSON.stringify({
    ...data,
    trainTypes: [''],
  })), /schema/)
  assert.throws(() => importRailwayJson(JSON.stringify({
    ...data,
    trackConnections: [{ ...data.trackConnections[0], trackCount: 3 }],
  })), /schema/)
})

test('preserves editable network station positions in JSON and validates their coordinates', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Network Railway',
    stations: [{ ...stations[0], networkPosition: { x: 42, y: 120 } }],
    trains: [],
    operations: [],
  }
  assert.deepEqual(importRailwayJson(exportRailwayJson(data)), data)
  assert.ok(validateVirtualRailwayShape({
    ...data,
    stations: [{ ...data.stations[0], networkPosition: { x: Number.NaN, y: 120 } }],
  }).some(({ message }) => message.includes('networkPosition.x')))
  assert.ok(validateVirtualRailwayShape({
    ...data,
    stations: [{ ...data.stations[0], networkPosition: { x: 42, z: 120 } }],
  }).some(({ message }) => message.includes('unexpected "z"')))
})

test('validates station graph connectivity and service route references', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Network Railway',
    lines: [],
    stations,
    trains: [train('T1', 'A', 'C', [
      point('A', null, '08:00:00'),
      point('C', '08:20:00', null),
    ], { serviceRouteId: 'missing' })],
    operations: [],
    trackConnections: [{ id: 'AB', fromStationId: 'A', toStationId: 'B', trackCount: 1 }],
    serviceRoutes: [{ id: 'A-C', name: 'A to C', stationIds: ['A', 'C'] }],
  }

  const codes = validateRailway(data).map(({ code }) => code)
  assert.ok(codes.includes('network.disconnected-service-route'))
  assert.ok(codes.includes('train.unknown-service-route'))
})

test('allows train paths to pass through connected stations omitted as stops', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Network Railway',
    stations,
    trains: [train('T1', 'A', 'C', [
      point('A', null, '08:00:00'),
      point('C', '08:20:00', null),
    ])],
    operations: [],
    trackConnections: [
      { id: 'AB', fromStationId: 'A', toStationId: 'B', trackCount: 2 },
      { id: 'BC', fromStationId: 'B', toStationId: 'C', trackCount: 2 },
    ],
    serviceRoutes: [],
  }

  assert.ok(!validateRailway(data).some(({ code }) => code === 'train.disconnected-route'))
})

test('validates passing stations as a single identical arrival and departure time', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Passing Test',
    lines: [],
    stations,
    trains: [train('pass-train', 'A', 'C', [
      point('A', null, '08:00:00'),
      { ...point('B', '08:10:00', '08:10:00'), isPassing: true },
      point('C', '08:20:00', null),
    ])],
    operations: [],
    trackConnections: [
      { id: 'AB', fromStationId: 'A', toStationId: 'B', trackCount: 2 },
      { id: 'BC', fromStationId: 'B', toStationId: 'C', trackCount: 2 },
    ],
  }
  assert.equal(validateRailway(data).some(({ code }) => code === 'train.invalid-passing-time'), false)

  const invalid = {
    ...data,
    trains: [train('pass-train', 'A', 'C', [
      point('A', null, '08:00:00'),
      { ...point('B', '08:10:00', '08:11:00'), isPassing: true },
      point('C', '08:20:00', null),
    ])],
  }
  assert.equal(validateRailway(invalid).some(({ code }) => code === 'train.invalid-passing-time'), true)
})

test('detects conflicts on single-track graph connections without legacy lines', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Single Track Railway',
    stations,
    lines: [],
    trains: [
      train('T1', 'A', 'B', [
        point('A', null, '08:00:00'),
        point('B', '08:10:00', null),
      ]),
      train('T2', 'B', 'A', [
        point('B', null, '08:05:00'),
        point('A', '08:15:00', null),
      ]),
    ],
    operations: [],
    trackConnections: [{ id: 'AB', fromStationId: 'A', toStationId: 'B', trackCount: 1 }],
    serviceRoutes: [],
  }

  assert.ok(validateRailway(data).some(({ code }) => code === 'single-track.conflict'))
})

test('reports single-track, platform, car-count, and teleportation conflicts', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Test Railway',
    lines: [{ id: 'L1', name: 'Line 1', stations: ['A', 'B'] }],
    stations,
    trains: [
      train('T1', 'A', 'B', [
        point('A', null, '08:00:00'),
        point('B', '08:10:00', '08:20:00'),
      ], { currentOperationIds: ['OP1'] }),
      train('T2', 'A', 'B', [
        point('A', null, '08:05:00'),
        point('B', '08:15:00', '08:20:00'),
      ]),
      train('T3', 'C', 'D', [
        point('C', null, '08:40:00'),
        point('D', '09:00:00', null),
      ], { currentOperationIds: ['OP1'] }),
    ],
    operations: [{ id: 'OP1', carCount: 4, trainIds: ['T1', 'T3'] }],
  }

  const codes = validateRailway(data, {
    singleTrackLineIds: ['L1'],
    expectedCarCounts: { T1: 2 },
  }).map((item) => item.code)

  assert.ok(codes.includes('single-track.conflict'))
  assert.ok(codes.includes('track.conflict'))
  assert.ok(codes.includes('operation.car-count-mismatch'))
  assert.ok(codes.includes('operation.teleportation'))
})
