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
  serviceDaySeconds,
  SERVICE_DAY_START_SECONDS,
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

test('uses 03:00 as the service-day boundary', () => {
  assert.equal(SERVICE_DAY_START_SECONDS, 3 * 60 * 60)
  assert.equal(serviceDaySeconds('02:59:59'), 27 * 60 * 60 - 1)
  assert.equal(serviceDaySeconds('03:00:00'), 3 * 60 * 60)
  assert.equal(serviceDaySeconds('25:00:00'), 25 * 60 * 60)
  assert.equal(serviceDaySeconds('03:10:00', '02:50:00'), 27 * 60 * 60 + 10 * 60)

  const assigned = assignOperations({
    version: '1.0.0',
    railwayName: 'Overnight Railway',
    stations,
    trains: [
      train('late', 'A', 'B', [point('A', null, '23:30:00'), point('B', '23:50:00', null)]),
      train('early', 'B', 'C', [point('B', null, '01:00:00'), point('C', '01:20:00', null)]),
    ],
    operations: [],
  })
  assert.deepEqual(assigned.operations.map(({ trainIds }) => trainIds), [['late', 'early']])

  const crossing = assignOperations({
    version: '1.0.0',
    railwayName: 'Boundary Crossing',
    stations,
    trains: [train('crossing', 'A', 'B', [
      point('A', null, '02:50:00'),
      point('B', '03:10:00', null),
    ])],
    operations: [],
  })
  assert.deepEqual(crossing.operations.map(({ trainIds }) => trainIds), [['crossing']])
})

test('merges an imported timetable as a system without replacing existing stations or operations', () => {
  const existing = {
    version: '1.0.0',
    railwayName: 'Existing Railway',
    stations: [
      { ...stations[0], id: 'existing-alpha', name: 'Alpha', kilopost: 42, isDepot: true },
      { ...stations[1], id: 'existing-beta', name: 'Beta' },
    ],
    serviceRoutes: [{ id: 'system-main', name: 'Existing Main', stationIds: ['existing-alpha', 'existing-beta'] }],
    trains: [train('T1', 'existing-alpha', 'existing-beta', [
      point('existing-alpha', null, '07:00:00'),
      point('existing-beta', '07:20:00', null),
    ], { currentOperationIds: ['AUTO-001'] })],
    operations: [{ id: 'AUTO-001', carCount: 6, trainIds: ['T1'] }],
    trainTypes: ['普通'],
    trainTypeColors: { 普通: '#123456' },
    trainTypeTextColors: { 普通: '#654321' },
  }
  const imported = {
    version: '1.0.0',
    railwayName: 'Imported Branch',
    stations: [
      { ...stations[0], id: 'alpha', name: 'Alpha', kilopost: 0 },
      { ...stations[1], id: 'beta', name: 'Beta', kilopost: 1 },
      { ...stations[2], id: 'gamma', name: 'Gamma', kilopost: 2 },
    ],
    serviceRoutes: [{ id: 'system-main', name: 'Imported Branch', stationIds: ['alpha', 'beta', 'gamma'] }],
    trains: [train('T1', 'alpha', 'gamma', [
      point('alpha', null, '08:00:00'),
      point('beta', '08:10:00', '08:11:00'),
      point('gamma', '08:20:00', null),
    ], { trainNumber: 'T2', currentOperationIds: ['AUTO-001'], serviceRouteId: 'system-main' })],
    operations: [{ id: 'AUTO-001', carCount: 4, trainIds: ['T1'] }],
    trainTypes: ['快速'],
    trainTypeColors: { 普通: '#FFFFFF', 快速: '#ABCDEF' },
    trainTypeTextColors: { 普通: '#FFFFFF', 快速: '#FEDCBA' },
  }

  const merged = mergeImportedRailway(existing, imported)
  assert.equal(merged.railwayName, 'Existing Railway')
  assert.equal(merged.stations.length, 3)
  assert.equal(merged.stations[0].id, 'existing-alpha')
  assert.equal(merged.stations[0].kilopost, 42)
  assert.equal(merged.stations[0].isDepot, true)
  assert.equal('lines' in merged, false)
  assert.equal('trackConnections' in merged, false)
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
  assert.deepEqual(merged.trainTypeColors, { 普通: '#123456', 快速: '#ABCDEF' })
  assert.deepEqual(merged.trainTypeTextColors, { 普通: '#654321', 快速: '#FEDCBA' })
})

test('combines imported trains with the same train number into one chronological train', () => {
  const existing = {
    version: '1.0.0',
    railwayName: 'Existing Railway',
    stations: [
      { ...stations[0], id: 'existing-alpha', name: 'Alpha' },
      { ...stations[1], id: 'existing-beta', name: 'Beta' },
    ],
    trains: [train('existing-train', 'existing-alpha', 'existing-beta', [
      point('existing-alpha', null, '07:00:00'),
      point('existing-beta', '07:20:00', null),
    ], { trainNumber: ' １２３ ', currentOperationIds: ['existing-operation'] })],
    operations: [{ id: 'existing-operation', carCount: 4, trainIds: ['existing-train'] }],
  }
  const imported = {
    version: '1.0.0',
    railwayName: 'Imported Railway',
    stations: [
      { ...stations[0], id: 'alpha', name: 'Alpha' },
      { ...stations[1], id: 'beta', name: 'Beta' },
      { ...stations[2], id: 'gamma', name: 'Gamma' },
      { ...stations[3], id: 'delta', name: 'Delta' },
      { ...stations[4], id: 'epsilon', name: 'Epsilon' },
    ],
    trains: [
      train('imported-train-late', 'gamma', 'delta', [
        point('gamma', null, '09:00:00'),
        point('delta', '09:20:00', null),
      ], { trainNumber: '123', currentOperationIds: ['imported-operation-late'] }),
      train('imported-train-disconnected', 'alpha', 'epsilon', [
        point('alpha', null, '10:00:00'),
        point('epsilon', '10:20:00', null),
      ], { trainNumber: '123', currentOperationIds: ['imported-operation-disconnected'] }),
      train('imported-train-middle', 'beta', 'gamma', [
        point('beta', null, '08:00:00'),
        point('gamma', '08:20:00', null),
      ], { trainNumber: '123', currentOperationIds: ['imported-operation-middle'] }),
    ],
    operations: [
      { id: 'imported-operation-late', carCount: 4, trainIds: ['imported-train-late'] },
      { id: 'imported-operation-disconnected', carCount: 4, trainIds: ['imported-train-disconnected'] },
      { id: 'imported-operation-middle', carCount: 4, trainIds: ['imported-train-middle'] },
    ],
  }

  const merged = mergeImportedRailway(existing, imported)

  assert.equal(merged.trains.length, 2)
  const combinedTrain = merged.trains.find(({ id }) => id === 'existing-train')
  const disconnectedTrain = merged.trains.find(({ id }) => id !== 'existing-train')
  assert.deepEqual(combinedTrain.route.map(({ stationId }) => stationId), [
    'existing-alpha',
    'existing-beta',
    'gamma',
    'delta',
  ])
  assert.deepEqual(combinedTrain.currentOperationIds, [
    'existing-operation',
    'imported-operation-middle',
    'imported-operation-late',
  ])
  assert.deepEqual(disconnectedTrain.route.map(({ stationId }) => stationId), [
    'existing-alpha',
    'epsilon',
  ])
  assert.deepEqual(merged.operations.map(({ trainIds }) => trainIds), [
    ['existing-train'],
    ['existing-train'],
    [disconnectedTrain.id],
    ['existing-train'],
  ])
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
    trainTypeColors: { 特急: '#123456' },
    trainTypeTextColors: { 特急: '#654321' },
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
  const legacyData = {
    ...data,
    lines: [{ id: 'legacy-main', name: 'Legacy Main', stations: ['A', 'B', 'C'] }],
    trackConnections: [{ malformed: 'ignored' }],
    stations: data.stations.map((station, index) => ({
      ...station,
      ...(index === 0 ? { networkPosition: { x: 42, y: 120 } } : {}),
    })),
  }
  delete legacyData.serviceRoutes
  const upgraded = importRailwayJson(exportRailwayJson(legacyData))
  const importedLegacy = importRailwayJson(JSON.stringify(legacyData))
  assert.equal('lines' in importedLegacy, false)
  assert.equal('trackConnections' in importedLegacy, false)
  assert.equal('networkPosition' in importedLegacy.stations[0], false)
  assert.equal('lines' in upgraded, false)
  assert.equal('trackConnections' in upgraded, false)
  assert.equal('networkPosition' in upgraded.stations[0], false)
  assert.deepEqual(upgraded.serviceRoutes, [{
    id: 'system-legacy-main',
    name: 'Legacy Main',
    stationIds: ['A', 'B', 'C'],
  }])
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
    trainTypeColors: { 特急: 'red' },
  })), /schema/)
})

test('does not retain legacy station network positions in JSON', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Station Railway',
    stations: [{ ...stations[0], networkPosition: { x: 42, y: 120 } }],
    trains: [],
    operations: [],
  }
  const imported = importRailwayJson(exportRailwayJson(data))
  assert.equal('networkPosition' in imported.stations[0], false)
})

test('validates operating system references without requiring station connections', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Service Route Railway',
    stations,
    trains: [train('T1', 'A', 'C', [
      point('A', null, '08:00:00'),
      point('C', '08:20:00', null),
    ], { serviceRouteId: 'A-C' })],
    operations: [],
    serviceRoutes: [{ id: 'A-C', name: 'A to C', stationIds: ['A', 'C'] }],
  }

  const codes = validateRailway(data).map(({ code }) => code)
  assert.deepEqual(codes, [])
})

test('validates passing stations as a single identical arrival and departure time', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Passing Test',
    stations,
    trains: [train('pass-train', 'A', 'C', [
      point('A', null, '08:00:00'),
      { ...point('B', '08:10:00', '08:10:00'), isPassing: true },
      point('C', '08:20:00', null),
    ])],
    operations: [],
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

test('reports platform, car-count, and teleportation conflicts', () => {
  const data = {
    version: '1.0.0',
    railwayName: 'Test Railway',
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
    expectedCarCounts: { T1: 2 },
  }).map((item) => item.code)

  assert.ok(codes.includes('track.conflict'))
  assert.ok(codes.includes('operation.car-count-mismatch'))
  assert.ok(codes.includes('operation.teleportation'))
})
