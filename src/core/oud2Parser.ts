import { deriveNetworkFromLines, deriveTrackConnections } from './network.ts'
import type { Line, ServiceRoute, Station, Train, TrainRoutePoint, TrainType, VirtualRailwayData } from './types.ts'

const STATION_TAGS = new Set(['station', 'stationinfo', 'sta', '駅'])
const LINE_TAGS = new Set(['line', 'railwayline', '路線'])
const TRACK_CONNECTION_TAGS = new Set(['trackconnection', 'stationconnection', '駅間接続'])
const TRAIN_TAGS = new Set(['train', 'diatrain', 'traininfo', '列車'])
const STOP_TAGS = new Set(['stop', 'stoppoint', 'routepoint', 'stationtime', 'trainstation', 'station', '駅時刻', '停車駅'])
const PARSER_ERROR_TAGS = new Set(['parsererror'])

type XmlElement = Element

interface OudSection {
  name: string
  properties: Map<string, string>
  children: OudSection[]
}

function normalizedName(name: string): string {
  return name.replace(/^.*:/, '').replace(/[\s_-]/g, '').toLowerCase()
}

function parseOudSections(text: string): OudSection[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/)

  const parseSection = (start: number): [OudSection, number] => {
    const section: OudSection = {
      name: lines[start].trim().slice(0, -1),
      properties: new Map(),
      children: [],
    }

    for (let index = start + 1; index < lines.length; index += 1) {
      const line = lines[index].trim()
      if (!line) continue
      if (line === '.') return [section, index + 1]

      if (/^[A-Za-z][A-Za-z0-9]*\.$/.test(line)) {
        const [child, nextIndex] = parseSection(index)
        section.children.push(child)
        index = nextIndex - 1
        continue
      }

      const separator = line.indexOf('=')
      if (separator > 0) {
        section.properties.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim())
      }
    }

    return [section, lines.length]
  }

  const sections: OudSection[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^[A-Za-z][A-Za-z0-9]*\.$/.test(lines[index].trim())) continue
    const [section, nextIndex] = parseSection(index)
    sections.push(section)
    index = nextIndex - 1
  }
  return sections
}

function getProperty(section: OudSection, ...names: string[]): string | null {
  for (const name of names) {
    const value = section.properties.get(name)
    if (value !== undefined && value !== '') return value
  }
  return null
}

function parseCompactOudTime(value: string): string | null {
  if (!/^\d{3,6}$/.test(value)) return null
  const hourLength = value.length === 3 || value.length === 5 ? 1 : 2
  const hasSeconds = value.length === 5 || value.length === 6
  const hour = Number(value.slice(0, hourLength))
  const minute = Number(value.slice(hourLength, hourLength + 2))
  const second = hasSeconds ? Number(value.slice(hourLength + 2)) : 0
  if (hour > 99 || minute > 59 || second > 59) return null
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
}

function normalizeOudRouteTimes(timesByStation: string[][], trainNumber: string): string[][] {
  let dayOffset = 0
  let previousTimeSeconds: number | null = null
  return timesByStation.map((times) => times.map((time) => {
    const [hour, minute, second] = time.split(':').map(Number)
    let totalSeconds = hour * 3600 + minute * 60 + second + dayOffset
    if (previousTimeSeconds !== null && totalSeconds < previousTimeSeconds) {
      dayOffset += 24 * 60 * 60
      totalSeconds += 24 * 60 * 60
    }
    previousTimeSeconds = totalSeconds

    const normalizedHour = Math.floor(totalSeconds / 3600)
    if (normalizedHour > 99) {
      throw new Error(`Train "${trainNumber}" has a time beyond the supported 99-hour range.`)
    }
    const normalizedMinute = Math.floor((totalSeconds % 3600) / 60)
    const normalizedSecond = totalSeconds % 60
    return `${String(normalizedHour).padStart(2, '0')}:${String(normalizedMinute).padStart(2, '0')}:${String(normalizedSecond).padStart(2, '0')}`
  }))
}

function parseOudEkiJikoku(value: string, stations: Station[], trainNumber: string): TrainRoutePoint[] | null {
  const entries = value.split(',')
  const timedEntries = entries.map((entry) => {
    const [timeData, trackData = ''] = entry.split('$', 2)
    const [ekiatsukai, timePart = ''] = timeData.split(';', 2)
    const parsedTimes = timePart
      .split('/')
      .map((time) => parseCompactOudTime(time.trim()))
      .filter((time): time is string => time !== null)
    return {
      times: parsedTimes,
      isPassing: ekiatsukai === '2',
      trackNumber: trackData.match(/^\s*(\d+)/)?.[1] ?? '',
    }
  })
  const activeIndices = timedEntries.flatMap((entry, index) =>
    entry.times.length > 0 || entry.isPassing ? [index] : [],
  )
  if (activeIndices.length < 2) {
    return null
  }

  const normalizedTimes = normalizeOudRouteTimes(
    activeIndices.map((stationIndex) => timedEntries[stationIndex].times),
    trainNumber,
  )
  const lastActiveIndex = activeIndices.at(-1)!
  return activeIndices.map((stationIndex, routeIndex) => {
    const station = stations[stationIndex]
    if (!station) {
      throw new Error(`Train "${trainNumber}" has more EkiJikoku entries than the station list.`)
    }
    const { trackNumber } = timedEntries[stationIndex]
    const times = normalizedTimes[routeIndex]
    const isOrigin = stationIndex === activeIndices[0]
    const isDestination = stationIndex === lastActiveIndex
    const arrivalTime = times.length === 0 || isOrigin ? null : times[0]
    const departureTime = times.length === 0 || isDestination ? null : times.at(-1)!
    return {
      stationId: station.id,
      arrivalTime,
      departureTime,
      trackNumber,
      operationEvent: null,
      isPassing: timedEntries[stationIndex].isPassing,
    }
  })
}

function splitStationEntriesAtBranchJunctions(stationEntries: Station[]): Station[][] {
  const paths: Station[][] = []
  let path: Station[] = []
  let stationIndices = new Map<string, number>()

  for (const [index, station] of stationEntries.entries()) {
    const repeatedAt = stationIndices.get(station.id)
    const closesCircularRoute = index === stationEntries.length - 1 &&
      station.id === stationEntries[0]?.id
    if (repeatedAt !== undefined && !closesCircularRoute && index < stationEntries.length - 1) {
      paths.push(path)
      path = [station]
      stationIndices = new Map([[station.id, 0]])
      continue
    }

    stationIndices.set(station.id, path.length)
    path.push(station)
  }

  if (path.length > 1) paths.push(path)
  return paths
}

function parseOuDiaText(text: string): VirtualRailwayData {
  const sections = parseOudSections(text)
  const railwaySection = sections.find((section) => section.name === 'Rosen')
  if (!railwaySection) throw new Error('The OuDia file does not contain a Rosen section.')

  const stations: Station[] = []
  const stationEntries: Station[] = []
  const stationByName = new Map<string, Station>()
  const stationIds = new Set<string>()
  for (const [index, section] of railwaySection.children
    .filter((child) => child.name === 'Eki')
    .entries()) {
    const name = getProperty(section, 'Ekimei')
    if (!name) throw new Error(`Station ${index + 1} in the OuDia file has no Ekimei value.`)
    let station = stationByName.get(name)
    if (!station) {
      const baseId = makeId(name, 'station')
      let id = baseId
      let duplicateId = 2
      while (stationIds.has(id)) {
        id = `${baseId}-${duplicateId}`
        duplicateId += 1
      }
      station = {
        id,
        name,
        kilopost: index,
        hasTracks: section.children.some((child) => child.name === 'EkiTrack2Cont'),
        canTurnBack: false,
        isDepot: false,
        depotCapacity: null,
      }
      stationByName.set(name, station)
      stationIds.add(id)
      stations.push(station)
    } else if (section.children.some((child) => child.name === 'EkiTrack2Cont')) {
      station.hasTracks = true
    }
    stationEntries.push(station)
  }
  if (stationEntries.length < 2) throw new Error('The OuDia file must contain at least two Eki stations.')

  const lineName = getProperty(railwaySection, 'Rosenmei') ?? 'Imported Railway'
  const lines: Line[] = splitStationEntriesAtBranchJunctions(stationEntries).map((path, index) => {
    const name = index === 0 ? lineName : `${lineName} (${index + 1})`
    return {
      id: makeId(index === 0 ? lineName : `${lineName}-branch-${index + 1}`, 'line'),
      name,
      stations: path.map((station) => station.id),
    }
  })
  const { trackConnections, serviceRoutes } = deriveNetworkFromLines(lines)
  const sourceTrainTypes = railwaySection.children
    .filter((section) => section.name === 'Ressyasyubetsu')
    .map((section) => getProperty(section, 'Syubetsumei') ?? '')
  const trainTypes = [...new Set(sourceTrainTypes.filter(Boolean))]
  const diagramSections = railwaySection.children.filter((section) => section.name === 'Dia')
  const trains: Train[] = []

  for (const diagram of diagramSections) {
    for (const direction of diagram.children.filter((section) => section.name === 'Kudari' || section.name === 'Nobori')) {
      for (const [index, section] of direction.children.filter((child) => child.name === 'Ressya').entries()) {
        const trainNumber = getProperty(section, 'Ressyabangou', 'Ressyamei') ?? `Train ${trains.length + 1}`
        const timeData = getProperty(section, 'EkiJikoku')
        if (!timeData) continue
        const route = parseOudEkiJikoku(
          timeData,
          direction.name === 'Nobori' ? [...stationEntries].reverse() : stationEntries,
          trainNumber,
        )
        if (!route) continue
        const typeIndex = Number(getProperty(section, 'Syubetsu') ?? '0')
        trains.push({
          id: makeId(`${direction.name}-${trainNumber}-${index + 1}`, 'train'),
          trainNumber,
          type: inferTrainType(sourceTrainTypes[typeIndex] ?? null),
          trainName: getProperty(section, 'Ressyamei') ?? undefined,
          typeName: sourceTrainTypes[typeIndex] || undefined,
          carCount: readNumber(getProperty(section, 'Gousuu')) ?? undefined,
          currentOperationIds: [],
          originStationId: route[0].stationId,
          destinationStationId: route.at(-1)!.stationId,
          route,
          isDepotIn: false,
          isDepotOut: false,
        })
      }
    }
  }

  if (!trains.length) throw new Error('No timed Ressya trains were found in the OuDia file.')

  return {
    version: '1.0.0',
    railwayName: lineName,
    lines,
    stations,
    trains,
    operations: [],
    trainTypes,
    trackConnections,
    serviceRoutes,
  }
}

function matchesName(element: Element, names: Set<string>): boolean {
  return names.has(normalizedName(element.localName || element.tagName))
}

function elementsWithin(root: ParentNode): XmlElement[] {
  return Array.from(root.querySelectorAll('*'))
}

function directChildren(element: XmlElement): XmlElement[] {
  return Array.from(element.children)
}

function readValue(element: XmlElement, aliases: string[]): string | null {
  const wanted = new Set(aliases.map(normalizedName))
  for (const attribute of Array.from(element.attributes)) {
    if (wanted.has(normalizedName(attribute.localName || attribute.name))) {
      return attribute.value.trim()
    }
  }
  for (const child of directChildren(element)) {
    if (wanted.has(normalizedName(child.localName || child.tagName))) {
      const value = child.textContent?.trim()
      if (value) return value
    }
  }
  return null
}

function readBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null || value === '') return fallback
  return ['true', '1', 'yes', 'あり', '有'].includes(value.toLowerCase())
}

function readNumber(value: string | null): number | null {
  if (value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function makeId(value: string, prefix: string): string {
  const normalized = value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return normalized ? `${prefix}-${normalized}` : `${prefix}-unknown`
}

function parseTime(value: string | null, context: string): string | null {
  if (!value || value === '-' || value === '||') return null
  const match = /^(\d{1,3}):([0-5]\d)(?::([0-5]\d))?$/.exec(value)
  if (!match) {
    throw new Error(`Invalid time "${value}" in ${context}; expected HH:MM or HH:MM:SS.`)
  }
  return `${match[1].padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}`
}

function inferTrainType(value: string | null): TrainType {
  const normalized = (value ?? '').toLowerCase()
  if (normalized.includes('回送') || normalized.includes('outofservice') || normalized.includes('deadhead')) {
    return 'OutofService'
  }
  if (normalized.includes('limited') || normalized.includes('特急')) return 'LimitedExpress'
  if (normalized.includes('express') || normalized.includes('急行') || normalized.includes('快速')) return 'Express'
  return 'Local'
}

function parseOperationEvent(stop: XmlElement): TrainRoutePoint['operationEvent'] {
  const eventElement = directChildren(stop).find((child) =>
    normalizedName(child.localName || child.tagName) === 'operationevent' ||
    normalizedName(child.localName || child.tagName) === '運用イベント',
  )
  const source = eventElement ?? stop
  const typeValue = readValue(source, ['type', 'eventType', '種別'])
  const type = typeValue?.toLowerCase()
  if (type !== 'combine' && type !== 'split' && type !== '併結' && type !== '解放') return null

  const operationId = readValue(source, ['operationId', 'operation', '運用ID'])
  if (!operationId) return null
  return {
    type: type === 'combine' || type === '併結' ? 'combine' : 'split',
    operationId,
    targetTrainId: readValue(source, ['targetTrainId', 'targetTrain', '移動先列車ID']),
  }
}

function findStops(trainElement: XmlElement): XmlElement[] {
  return elementsWithin(trainElement).filter((element) =>
    matchesName(element, STOP_TAGS) ||
    ((normalizedName(element.localName || element.tagName).includes('駅') ||
      readValue(element, ['stopType']) !== null) &&
      readValue(element, ['stationId', 'station', 'stationName', '駅名', '駅ID']) !== null),
  )
}

function getTrainStopName(stop: XmlElement): string | null {
  return readValue(stop, ['stationId', 'station', 'stationName', 'name', '駅名', '駅ID'])
}

function parseRoutePoint(
  stop: XmlElement,
  stationIdsByName: Map<string, string>,
  context: string,
): TrainRoutePoint | null {
  const stationName = getTrainStopName(stop)
  if (!stationName) return null
  const stationId = stationIdsByName.get(stationName) ?? stationName
  const arrivalTime = parseTime(readValue(stop, ['arrivalTime', 'arrival', 'arrive', '到着', '到着時刻']), context)
  const departureTime = parseTime(readValue(stop, ['departureTime', 'departure', 'depart', '発車', '発時刻']), context)
  const stopType = readValue(stop, ['stopType'])
  return {
    stationId,
    arrivalTime,
    departureTime,
    trackNumber: readValue(stop, ['trackNumber', 'track', '番線', '着発番線']) ?? '',
    operationEvent: parseOperationEvent(stop),
    isPassing: stopType === '2' ||
      readBoolean(readValue(stop, ['isPassing', 'passing', 'pass', '通過']), false),
  }
}

function findTrainElements(document: Document): XmlElement[] {
  return elementsWithin(document).filter((element) => matchesName(element, TRAIN_TAGS))
}

export function decodeOud2File(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes)
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes)
  }
  if (bytes.length >= 4 && bytes.length % 2 === 0) {
    const evenNulls = bytes.filter((_, index) => index % 2 === 0 && bytes[index] === 0).length
    const oddNulls = bytes.filter((_, index) => index % 2 === 1 && bytes[index] === 0).length
    const halfLength = bytes.length / 2
    if (evenNulls > halfLength / 2) return new TextDecoder('utf-16be').decode(bytes)
    if (oddNulls > halfLength / 2) return new TextDecoder('utf-16le').decode(bytes)
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    try {
      return new TextDecoder('shift_jis').decode(bytes)
    } catch (error) {
      throw new Error('The .oud2 file encoding is not supported.', { cause: error })
    }
  }
}

export function parseOud2(xml: string, parser?: DOMParser): VirtualRailwayData {
  if (typeof xml !== 'string' || !xml.trim()) {
    throw new Error('The .oud2 document is empty.')
  }
  const trimmedInput = xml.trimStart().replace(/^\uFEFF/, '')
  if (/^FileType=OuDia(?:Second)?\./im.test(trimmedInput)) {
    return parseOuDiaText(trimmedInput)
  }
  if (!trimmedInput.startsWith('<')) {
    throw new Error('Unsupported .oud2 format. Expected OuDia text or XML.')
  }

  const xmlParser = parser ?? (typeof DOMParser === 'undefined' ? undefined : new DOMParser())
  if (!xmlParser) {
    throw new Error('.oud2 parsing requires the browser DOMParser API.')
  }

  const document = xmlParser.parseFromString(xml, 'application/xml')
  if (
    PARSER_ERROR_TAGS.has(normalizedName(document.documentElement?.localName ?? '')) ||
    elementsWithin(document).some((element) => PARSER_ERROR_TAGS.has(normalizedName(element.localName || element.tagName)))
  ) {
    throw new Error('The .oud2 document is not well-formed XML.')
  }

  const stationElements = elementsWithin(document).filter((element) =>
    matchesName(element, STATION_TAGS) &&
    readValue(element, ['arrivalTime', 'arrival', '到着', '到着時刻']) === null &&
    readValue(element, ['departureTime', 'departure', '発車', '発時刻']) === null,
  )
  const stations: Station[] = stationElements.map((element, index) => {
    const name = readValue(element, ['name', 'stationName', '駅名']) ??
      element.getAttribute('name')?.trim() ??
      element.textContent?.trim() ??
      `Station ${index + 1}`
    const id = readValue(element, ['id', 'stationId', '駅ID']) ?? makeId(name, 'station')
    return {
      id,
      name,
      kilopost: readNumber(readValue(element, ['kilopost', 'distance', 'km', 'キロ程'])) ?? index,
      hasTracks: readBoolean(readValue(element, ['hasTracks', 'passingTracks', '待避線']), false),
      canTurnBack: readBoolean(readValue(element, ['canTurnBack', 'turnback', '折返']), false),
      isDepot: readBoolean(readValue(element, ['isDepot', 'depot', '車庫']), false),
      depotCapacity: readNumber(readValue(element, ['depotCapacity', 'capacity', '収容数'])),
    }
  })

  const stationIdsByName = new Map<string, string>()
  for (const station of stations) {
    stationIdsByName.set(station.name, station.id)
    stationIdsByName.set(station.id, station.id)
  }

  const trainElements = findTrainElements(document)
  const trains: Train[] = trainElements.map((element, index) => {
    const trainNumber = readValue(element, ['trainNumber', 'number', 'name', '列車番号', '列車名']) ??
      `Train ${index + 1}`
    const typeName = readValue(element, ['typeName', 'type', 'trainType', '種別'])
    const id = readValue(element, ['id', 'trainId', '列車ID']) ?? makeId(trainNumber, 'train')
    const route = findStops(element)
      .map((stop) => parseRoutePoint(stop, stationIdsByName, `train "${trainNumber}"`))
      .filter((point): point is TrainRoutePoint => point !== null)
    const uniqueRoute = route.filter((point, routeIndex) =>
      route.findIndex((candidate) => candidate.stationId === point.stationId) === routeIndex,
    )
    if (uniqueRoute.length < 2) {
      throw new Error(`Train "${trainNumber}" must contain at least two station route points.`)
    }
    for (const point of uniqueRoute) {
      if (!stations.some((station) => station.id === point.stationId)) {
        const station: Station = {
          id: point.stationId,
          name: point.stationId,
          kilopost: stations.length,
          hasTracks: false,
          canTurnBack: false,
          isDepot: false,
          depotCapacity: null,
        }
        stations.push(station)
        stationIdsByName.set(station.name, station.id)
      }
    }

    return {
      id,
      trainNumber,
      type: inferTrainType(typeName),
      trainName: readValue(element, ['trainName', '列車名']) ?? undefined,
      typeName: typeName ?? undefined,
      carCount: readNumber(readValue(element, ['carCount', 'gousuu', '号数', '両数'])) ?? undefined,
      serviceRouteId: readValue(element, ['serviceRouteId', 'systemId', '系統ID']) ?? undefined,
      currentOperationIds: [],
      originStationId: readValue(element, ['originStationId', 'origin', '始発駅ID']) ??
        uniqueRoute[0].stationId,
      destinationStationId: readValue(element, ['destinationStationId', 'destination', '終着駅ID']) ??
        uniqueRoute[uniqueRoute.length - 1].stationId,
      route: uniqueRoute,
      isDepotIn: readBoolean(readValue(element, ['isDepotIn', 'depotIn', '入庫']), false),
      isDepotOut: readBoolean(readValue(element, ['isDepotOut', 'depotOut', '出庫']), false),
    }
  })

  const lines: Line[] = elementsWithin(document)
    .filter((element) => matchesName(element, LINE_TAGS))
    .map((element, index) => {
      const name = readValue(element, ['name', 'lineName', '路線名']) ?? `Line ${index + 1}`
      const refs = elementsWithin(element)
        .filter((child) => ['stationref', 'stationid', '駅ID'].includes(normalizedName(child.localName || child.tagName)))
        .map((child) => child.textContent?.trim() ?? '')
        .filter(Boolean)
      const listValue = readValue(element, ['stations', 'stationIds', '駅一覧'])
      const references = refs.length ? refs : (listValue?.split(/[,、\s]+/).filter(Boolean) ?? [])
      return {
        id: readValue(element, ['id', 'lineId', '路線ID']) ?? makeId(name, 'line'),
        name,
        stations: references.map((reference) => stationIdsByName.get(reference) ?? reference),
      }
    })

  const explicitServiceRoutes: ServiceRoute[] = elementsWithin(document)
    .filter((element) => normalizedName(element.localName || element.tagName) === 'serviceroute')
    .map((element, index) => {
      const name = readValue(element, ['name', 'routeName', '系統名']) ?? `System ${index + 1}`
      const refs = elementsWithin(element)
        .filter((child) => ['stationref', 'stationid', '駅ID'].includes(normalizedName(child.localName || child.tagName)))
        .map((child) => child.textContent?.trim() ?? '')
        .filter(Boolean)
      const listValue = readValue(element, ['stations', 'stationIds', '駅一覧'])
      const references = refs.length ? refs : (listValue?.split(/[,、\s]+/).filter(Boolean) ?? [])
      return {
        id: readValue(element, ['id', 'routeId', 'systemId', '系統ID']) ?? makeId(name, 'system'),
        name,
        stationIds: references.map((reference) => stationIdsByName.get(reference) ?? reference),
      }
    })
  const legacyNetwork = deriveNetworkFromLines(lines)
  const routeConnections = deriveTrackConnections(trains.map(({ id, route }) => ({
    id,
    stationIds: route.map(({ stationId }) => stationId),
  })))
  const explicitConnections = elementsWithin(document)
    .filter((element) => matchesName(element, TRACK_CONNECTION_TAGS))
    .flatMap((element, index) => {
      const fromRef = readValue(element, ['fromStationId', 'from', '起点駅ID'])
      const toRef = readValue(element, ['toStationId', 'to', '終点駅ID'])
      if (!fromRef || !toRef) return []
      const fromStationId = stationIdsByName.get(fromRef) ?? fromRef
      const toStationId = stationIdsByName.get(toRef) ?? toRef
      const trackCount = readNumber(readValue(element, ['trackCount', 'tracks', '線路数']))
      return [{
        id: readValue(element, ['id', 'connectionId', '接続ID']) ?? `connection-${index + 1}`,
        fromStationId,
        toStationId,
        trackCount: trackCount === 1 ? 1 as const : 2 as const,
      }]
    })
  const trackConnections = explicitConnections.length
    ? explicitConnections
    : lines.length
      ? legacyNetwork.trackConnections
      : routeConnections
  const serviceRoutes = explicitServiceRoutes.length
    ? explicitServiceRoutes
    : legacyNetwork.serviceRoutes

  if (!trains.length) {
    throw new Error('No trains were found in the .oud2 document.')
  }

  const railwayName = readValue(document.documentElement, ['railwayName', 'name', '路線名']) ??
    document.documentElement.getAttribute('name')?.trim() ??
    'Imported Railway'

  return {
    version: '1.0.0',
    railwayName,
    lines,
    stations,
    trains,
    operations: [],
    trainTypes: [...new Set(trains.map((train) => train.typeName).filter((name): name is string => Boolean(name)))],
    trackConnections,
    serviceRoutes,
  }
}
