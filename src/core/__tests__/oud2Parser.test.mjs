import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeOud2File, parseOud2 } from '../oud2Parser.ts'
import { assignOperations } from '../../railway/operationEngine.ts'

class MockElement {
  constructor(localName, attributes = {}, children = []) {
    this.localName = localName
    this.tagName = localName
    this.attributes = Object.entries(attributes).map(([name, value]) => ({ name, localName: name, value }))
    this.children = children
    this.textContent = ''
  }

  getAttribute(name) {
    return this.attributes.find((attribute) => attribute.name === name)?.value ?? null
  }

  querySelectorAll() {
    return this.children.flatMap((child) => [child, ...child.querySelectorAll('*')])
  }
}

class MockDOMParser {
  parseFromString() {
    const stop = (stationId, departureTime, arrivalTime) =>
      new MockElement('Stop', { stationId, departureTime, arrivalTime, trackNumber: '1' })
    const root = new MockElement('Railway', { railwayName: 'Mock Railway' }, [
      new MockElement('Stations', {}, [
        new MockElement('Station', { id: 'alpha', name: 'Alpha', kilopost: '0' }),
        new MockElement('Station', { id: 'beta', name: 'Beta', kilopost: '4.5' }),
      ]),
      new MockElement('Lines', {}, [
        new MockElement('Line', { id: 'main', name: 'Main', stations: 'alpha,beta' }),
      ]),
      new MockElement('Trains', {}, [
        new MockElement('Train', { id: 'T1', trainNumber: '101M', type: 'Local' }, [
          new MockElement('Route', {}, [
            stop('alpha', '08:00:00', ''),
            new MockElement('Stop', { stationId: 'beta', departureTime: '', arrivalTime: '08:12:00' }, [
              new MockElement('OperationEvent', { type: 'combine', operationId: '02K' }),
            ]),
          ]),
        ]),
      ]),
    ])
    return {
      documentElement: root,
      querySelectorAll: (selector) => root.querySelectorAll(selector),
    }
  }
}

test('converts an XML DOM into the railway JSON model', () => {
  const data = parseOud2('<Railway />', new MockDOMParser())

  assert.equal(data.railwayName, 'Mock Railway')
  assert.deepEqual(data.lines, [{ id: 'main', name: 'Main', stations: ['alpha', 'beta'] }])
  assert.deepEqual(data.trackConnections.map(({ fromStationId, toStationId }) => [fromStationId, toStationId]), [['alpha', 'beta']])
  assert.deepEqual(data.serviceRoutes, [{ id: 'system-main', name: 'Main', stationIds: ['alpha', 'beta'] }])
  assert.deepEqual(data.stations.map(({ id, name }) => [id, name]), [
    ['alpha', 'Alpha'],
    ['beta', 'Beta'],
  ])
  assert.equal(data.trains[0].trainNumber, '101M')
  assert.equal(data.trains[0].route[0].departureTime, '08:00:00')
  assert.equal(data.trains[0].route[1].arrivalTime, '08:12:00')
  assert.deepEqual(data.trains[0].route[1].operationEvent, {
    type: 'combine',
    operationId: '02K',
    targetTrainId: null,
  })
  assert.deepEqual(data.operations, [])
})

test('imports explicit station connections and named service routes from XML', () => {
  class ExplicitNetworkParser extends MockDOMParser {
    parseFromString(...args) {
      const document = super.parseFromString(...args)
      document.documentElement.children.push(new MockElement('Network', {}, [
        new MockElement('TrackConnection', {
          id: 'alpha-beta',
          fromStationId: 'alpha',
          toStationId: 'beta',
          trackCount: '1',
        }),
        new MockElement('ServiceRoute', {
          id: 'airport',
          name: 'Airport Line',
          stationIds: 'alpha,beta',
        }),
      ]))
      return document
    }
  }

  const data = parseOud2('<Railway />', new ExplicitNetworkParser())
  assert.deepEqual(data.trackConnections, [{
    id: 'alpha-beta',
    fromStationId: 'alpha',
    toStationId: 'beta',
    trackCount: 1,
  }])
  assert.deepEqual(data.serviceRoutes, [{
    id: 'airport',
    name: 'Airport Line',
    stationIds: ['alpha', 'beta'],
  }])
})

test('rejects empty input before invoking the browser parser', () => {
  assert.throws(() => parseOud2('  '), /empty/)
})

test('imports native OuDiaSecond text files and compact station times', () => {
  const text = `FileType=OuDiaSecond.1.15
Rosen.
Rosenmei=Test Line
Eki.
Ekimei=Alpha
EkiTrack2Cont.
.
.
Eki.
Ekimei=Beta
.
Eki.
Ekimei=Gamma
.
Ressyasyubetsu.
Syubetsumei=快速
.
Dia.
DiaName=Weekday
Kudari.
Ressya.
Houkou=Kudari
Syubetsu=0
Ressyabangou=101M
Ressyamei=Express Name
Gousuu=8
EkiJikoku=1;800$1,1;810/811$1,1;820$1
.
.
.
.`

  const data = parseOud2(text)
  assert.equal(data.railwayName, 'Test Line')
  assert.deepEqual(data.stations.map(({ name }) => name), ['Alpha', 'Beta', 'Gamma'])
  assert.equal(data.trains.length, 1)
  assert.equal(data.trains[0].trainNumber, '101M')
  assert.equal(data.trains[0].type, 'Express')
  assert.equal(data.trains[0].typeName, '快速')
  assert.equal(data.trains[0].trainName, 'Express Name')
  assert.equal(data.trains[0].carCount, 8)
  assert.deepEqual(data.trainTypes, ['快速'])
  assert.deepEqual(data.trackConnections.map(({ fromStationId, toStationId }) => [fromStationId, toStationId]), [
    [data.stations[0].id, data.stations[1].id],
    [data.stations[1].id, data.stations[2].id],
  ])
  assert.deepEqual(data.serviceRoutes[0].stationIds, data.stations.map(({ id }) => id))
  assert.deepEqual(data.trains[0].route.map(({ arrivalTime, departureTime }) => [arrivalTime, departureTime]), [
    [null, '08:00:00'],
    ['08:10:00', '08:11:00'],
    ['08:20:00', null],
  ])
})

test('parses real OuDia station entries separated by commas and ignores stop-pattern flags', () => {
  const text = `FileType=OuDia.1.02
Rosen.
Rosenmei=Test Line
Eki.
Ekimei=Alpha
.
Eki.
Ekimei=Beta
.
Eki.
Ekimei=Gamma
.
Dia.
DiaName=Weekday
Kudari.
Ressya.
Ressyabangou=1001
EkiJikoku=1;800$1,1;810/811$2,1;820$3
.
.
.
.`

  const data = parseOud2(text)
  assert.equal(data.trains.length, 1)
  assert.deepEqual(data.trains[0].route.map(({ stationId, arrivalTime, departureTime, trackNumber }) => [
    stationId,
    arrivalTime,
    departureTime,
    trackNumber,
  ]), [
    [data.stations[0].id, null, '08:00:00', '1'],
    [data.stations[1].id, '08:10:00', '08:11:00', '2'],
    [data.stations[2].id, '08:20:00', null, '3'],
  ])
})

test('imports a repeated first and last station as a circular route', () => {
  const text = `FileType=OuDia.1.02
Rosen.
Rosenmei=Circle Line
Eki.
Ekimei=Alpha
.
Eki.
Ekimei=Beta
.
Eki.
Ekimei=Gamma
.
Eki.
Ekimei=Alpha
.
Dia.
Kudari.
Ressya.
Ressyabangou=Circle
EkiJikoku=1;800,1;810,1;820,1;830
.
.
.
.`

  const data = parseOud2(text)
  const [alpha, beta, gamma] = data.stations
  assert.equal(data.stations.length, 3)
  assert.deepEqual(data.lines[0].stations, [alpha.id, beta.id, gamma.id, alpha.id])
  assert.deepEqual(
    new Set(data.trackConnections.map(({ fromStationId, toStationId }) =>
      [fromStationId, toStationId].sort().join(':'),
    )),
    new Set([
      [alpha.id, beta.id].sort().join(':'),
      [beta.id, gamma.id].sort().join(':'),
      [gamma.id, alpha.id].sort().join(':'),
    ]),
  )
  assert.deepEqual(data.trains[0].route.map(({ stationId }) => stationId), [alpha.id, beta.id, gamma.id, alpha.id])
  assert.equal(data.trains[0].originStationId, data.trains[0].destinationStationId)
})

test('imports repeated middle stations as shared branch junctions', () => {
  const text = `FileType=OuDia.1.02
Rosen.
Rosenmei=Branch Line
Eki.
Ekimei=Alpha
.
Eki.
Ekimei=Junction
.
Eki.
Ekimei=Beta
.
Eki.
Ekimei=Junction
.
Eki.
Ekimei=Gamma
.
Dia.
Kudari.
Ressya.
Ressyabangou=Branch
EkiJikoku=1;800,1;810,1;820,1;830,1;840
.
.
.
.`

  const data = parseOud2(text)
  const alpha = data.stations.find(({ name }) => name === 'Alpha')
  const junction = data.stations.find(({ name }) => name === 'Junction')
  const beta = data.stations.find(({ name }) => name === 'Beta')
  const gamma = data.stations.find(({ name }) => name === 'Gamma')
  assert.equal(data.stations.length, 4)
  assert.deepEqual(data.lines[0].stations, [alpha.id, junction.id, beta.id, junction.id, gamma.id])
  assert.deepEqual(
    new Set(data.trackConnections.map(({ fromStationId, toStationId }) =>
      [fromStationId, toStationId].sort().join(':'),
    )),
    new Set([
      [alpha.id, junction.id].sort().join(':'),
      [junction.id, beta.id].sort().join(':'),
      [junction.id, gamma.id].sort().join(':'),
    ]),
  )
  assert.deepEqual(
    data.trains[0].route.map(({ stationId }) => stationId),
    [alpha.id, junction.id, beta.id, junction.id, gamma.id],
  )
})

test('normalizes after-midnight OuDia times so operation assignment accepts the train', () => {
  const text = `FileType=OuDia.1.02
Rosen.
Rosenmei=Overnight Line
Eki.
Ekimei=Alpha
.
Eki.
Ekimei=Beta
.
Eki.
Ekimei=Gamma
.
Dia.
DiaName=Weekday
Kudari.
Ressya.
Ressyabangou=Overnight
EkiJikoku=1;2350$1,1;0005/0010$1,1;0020$1
.
.
.
.`

  const imported = parseOud2(text)
  assert.deepEqual(imported.trains[0].route.map(({ arrivalTime, departureTime }) => [
    arrivalTime,
    departureTime,
  ]), [
    [null, '23:50:00'],
    ['24:05:00', '24:10:00'],
    ['24:20:00', null],
  ])
  const assigned = assignOperations(imported)
  assert.deepEqual(assigned.operations.map(({ trainIds }) => trainIds), [[imported.trains[0].id]])
})

test('skips trains with fewer than two timed stations in OuDia files', () => {
  const text = `FileType=OuDiaSecond.1.15
Rosen.
Rosenmei=Test Line
Eki.
Ekimei=Alpha
.
Eki.
Ekimei=Beta
.
Eki.
Ekimei=Gamma
.
Dia.
Kudari.
Ressya.
Ressyabangou=NoTimes
EkiJikoku=1,,1
.
Ressya.
Ressyabangou=OneStop
EkiJikoku=1;800,,1
.
Ressya.
Ressyabangou=Valid
EkiJikoku=1;800$1,1;810$1,1;820$1,1
.
.
.
.`

  const data = parseOud2(text)
  assert.deepEqual(data.trains.map(({ trainNumber }) => trainNumber), ['Valid'])
})

test('decodes UTF-8 and UTF-16 OuDia files', () => {
  const utf8 = new TextEncoder().encode('FileType=OuDiaSecond.1.15\n')
  const utf16 = new Uint8Array([0xff, 0xfe, 0x41, 0x00])
  const utf16WithoutBom = new Uint8Array([0x41, 0x00, 0x42, 0x00])
  assert.equal(decodeOud2File(utf8.buffer), 'FileType=OuDiaSecond.1.15\n')
  assert.equal(decodeOud2File(utf16.buffer), 'A')
  assert.equal(decodeOud2File(utf16WithoutBom.buffer), 'AB')
})
