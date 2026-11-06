const TIME_PATTERN = /^(\d{2}):([0-5]\d):([0-5]\d)$/

export function digitsToTime(digits: string): string {
  if (!/^\d{6}$/.test(digits)) {
    throw new Error('Enter time as six digits in HHMMSS format.')
  }

  const hours = digits.slice(0, 2)
  const minutes = digits.slice(2, 4)
  const seconds = digits.slice(4, 6)
  if (Number(minutes) > 59 || Number(seconds) > 59) {
    throw new Error('Minutes and seconds must be between 00 and 59.')
  }
  return `${hours}:${minutes}:${seconds}`
}

export function timeToSeconds(time: string): number {
  const match = TIME_PATTERN.exec(time)
  if (!match) {
    throw new Error(`Invalid time "${time}". Expected HH:MM:SS.`)
  }

  const [, hours, minutes, seconds] = match
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

export function secondsToTime(totalSeconds: number): string {
  if (!Number.isInteger(totalSeconds) || totalSeconds < 0 || totalSeconds > 359999) {
    throw new Error('Time must be a non-negative whole number of seconds below 100 hours.')
  }

  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':')
}

export function getTrainStartTime(train: TrainLike): string | null {
  const originPoint = train.route.find((point) => point.stationId === train.originStationId)
  return originPoint?.departureTime ?? train.route.find((point) => point.departureTime !== null)?.departureTime ?? null
}

export function getTrainEndTime(train: TrainLike): string | null {
  const destinationPoint = train.route.find((point) => point.stationId === train.destinationStationId)
  return destinationPoint?.arrivalTime ?? [...train.route].reverse().find((point) => point.arrivalTime !== null)?.arrivalTime ?? null
}

export function getTimeAtStation(
  train: TrainLike,
  stationId: string,
  preference: 'arrival' | 'departure' = 'departure',
): string | null {
  const point = train.route.find((routePoint) => routePoint.stationId === stationId)
  if (!point) return null
  return preference === 'arrival'
    ? point.arrivalTime ?? point.departureTime
    : point.departureTime ?? point.arrivalTime
}

interface TrainLike {
  originStationId: string
  destinationStationId: string
  route: Array<{
    stationId: string
    arrivalTime: string | null
    departureTime: string | null
  }>
}
