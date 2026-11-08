import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import sampleOud2 from '../../core/fixtures/mobile-demo.oud2?raw';
import { assignOperations } from '../../core/operationEngine.ts';
import { decodeOud2File, parseOud2 } from '../../core/oud2Parser.ts';
import {
	navigateRailwayViewAtom,
	railwayImportRequestAtom,
	railwayViewAtom,
	returnToPreviousRailwayViewAtom,
} from '../../features/main/states/railwayView.js';
import { mergeImportedRailway } from '../../railway/importMerge.ts';
import { IndexedDbRailwayStore } from '../../railway/persistence.ts';
import { digitsToTime, secondsToTime, SERVICE_DAY_START_SECONDS, serviceDaySeconds, timeToSeconds } from '../../railway/time.ts';
import './railway-editor.css';

const MIN_VISIBLE_MINUTES = 15;
const MAX_VISIBLE_MINUTES = 180;
const SERVICE_DURATION_SECONDS = 36 * 60 * 60;
const ROW_HEIGHT = 48;
const TRAIN_COLORS = ['#176b5b', '#c45232', '#7358a5', '#2471a3', '#b57c13', '#bc4676'];
const DEFAULT_TRAIN_TYPES = [
	{ name: '普通', type: 'Local' },
	{ name: '快速・急行', type: 'Express' },
	{ name: '特急', type: 'LimitedExpress' },
	{ name: '回送', type: 'OutofService' },
];

function inferTrainType(name) {
	if (/回送|回/.test(name)) return 'OutofService';
	if (/特急/.test(name)) return 'LimitedExpress';
	if (/急行|快速/.test(name)) return 'Express';
	return 'Local';
}

function getTrainTypeName(train) {
	return train.typeName ?? DEFAULT_TRAIN_TYPES.find(({ type }) => type === train.type)?.name ?? train.type;
}

function getTrainDirection(train, serviceRoutes, stationOrder) {
	const serviceRoute = getTrainServiceRoute(train, serviceRoutes);
	const order = serviceRoute?.stationIds ?? stationOrder;
	const originIndex = order.indexOf(train.originStationId);
	const destinationIndex = order.indexOf(train.destinationStationId);
	return originIndex < 0 || destinationIndex < 0 || destinationIndex >= originIndex ? 'down' : 'up';
}

function getTrainServiceRoute(train, serviceRoutes) {
	return (
		serviceRoutes.find((route) => route.id === train.serviceRouteId) ??
		serviceRoutes.find((route) => route.stationIds.includes(train.originStationId) && route.stationIds.includes(train.destinationStationId))
	);
}

function getDiagramPoints(train, stations, chartScale) {
	const serviceStartTime = getTrainServiceStartTime(train);
	return train.route.flatMap((point, routeIndex) => {
		const isLastPointAtCircularBoundary =
			routeIndex === train.route.length - 1 && stations.some((station) => station.isCircularBoundary && station.id === point.stationId);
		const stationIndex = stations.findIndex(
			(station) => station.id === point.stationId && station.isCircularBoundary === isLastPointAtCircularBoundary,
		);
		if (stationIndex < 0) return [];
		const y = stationIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
		const times = [...new Set([point.arrivalTime, point.departureTime].filter(Boolean))];
		return times.map((time) => ({
			x: (serviceDaySeconds(time, serviceStartTime) - SERVICE_DAY_START_SECONDS) * chartScale,
			y,
			routeIndex,
		}));
	});
}

function getTrainServiceStartTime(train) {
	const origin = train.route.find((point) => point.stationId === train.originStationId);
	return origin?.departureTime ?? train.route.find((point) => point.departureTime)?.departureTime;
}

function getTrainStartSeconds(train) {
	const time = getTrainServiceStartTime(train);
	return time ? serviceDaySeconds(time) : Number.POSITIVE_INFINITY;
}

function makeUniqueId(prefix, existingIds) {
	const existing = new Set(existingIds);
	let suffix = Date.now();
	while (existing.has(`${prefix}-${suffix}`)) suffix += 1;
	return `${prefix}-${suffix}`;
}

function getTimeLabel(seconds) {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatTimetableTime(time, showSeconds) {
	if (!time) return '';
	const compactTime = time.replaceAll(':', '');
	return showSeconds ? compactTime : compactTime.slice(0, 4);
}

function shiftTrain(train, deltaSeconds) {
	const serviceStartTime = getTrainServiceStartTime(train);
	return {
		...train,
		route: train.route.map((point) => ({
			...point,
			arrivalTime:
				point.arrivalTime === null ?
					null
				:	secondsToTime(Math.max(SERVICE_DAY_START_SECONDS, serviceDaySeconds(point.arrivalTime, serviceStartTime) + deltaSeconds)),
			departureTime:
				point.departureTime === null ?
					null
				:	secondsToTime(Math.max(SERVICE_DAY_START_SECONDS, serviceDaySeconds(point.departureTime, serviceStartTime) + deltaSeconds)),
		})),
	};
}

export function RailwayEditor() {
	const [railway, setRailway] = useState(null);
	const [isLoadingRailway, setIsLoadingRailway] = useState(true);
	const activeTab = useAtomValue(railwayViewAtom);
	const navigateView = useSetAtom(navigateRailwayViewAtom);
	const returnToPreviousView = useSetAtom(returnToPreviousRailwayViewAtom);
	const [selectedTrainId, setSelectedTrainId] = useState('');
	const [selectedStop, setSelectedStop] = useState(null);
	const [selectedOperationIndex, setSelectedOperationIndex] = useState(0);
	const [newStationName, setNewStationName] = useState('');
	const [selectedStationId, setSelectedStationId] = useState('');
	const [timetableTypeFilter, setTimetableTypeFilter] = useState('all');
	const [timetableSort, setTimetableSort] = useState('time');
	const [timetableServiceRouteId, setTimetableServiceRouteId] = useState('all');
	const [timetableDirection, setTimetableDirection] = useState('all');
	const [stationDirection, setStationDirection] = useState('all');
	const [diagramDirection, setDiagramDirection] = useState('all');
	const [diagramServiceRouteId, setDiagramServiceRouteId] = useState('all');
	const [showTrainLabels, setShowTrainLabels] = useState(true);
	const [showTrainNames, setShowTrainNames] = useState(true);
	const [showSeconds, setShowSeconds] = useState(false);
	const [visibleMinutes, setVisibleMinutes] = useState(120);
	const [viewportWidth, setViewportWidth] = useState(360);
	const [message, setMessage] = useState('');
	const [error, setError] = useState('');
	const [pendingImport, setPendingImport] = useState(null);
	const [draggedTrainId, setDraggedTrainId] = useState('');
	const importRequest = useAtomValue(railwayImportRequestAtom);
	const importInput = useRef(null);
	const railwayRef = useRef(null);
	const selectedStationIdRef = useRef('');
	const railwayStoreRef = useRef(null);
	const persistenceReadyRef = useRef(false);
	const saveQueueRef = useRef(Promise.resolve());
	const chartViewport = useRef(null);
	const stationViewport = useRef(null);
	const newStationInput = useRef(null);
	const dragState = useRef(null);
	const pinchState = useRef(null);
	const suppressTrainClickRef = useRef(false);
	const chartScaleRef = useRef(360 / (120 * 60));

	const stations = useMemo(() => {
		if (!railway) return [];
		return railway.stations;
	}, [railway]);

	const operations = railway?.operations ?? [];
	const serviceRoutes = useMemo(() => railway?.serviceRoutes ?? [], [railway]);
	const displayStations = useMemo(() => {
		const rows = stations.map((station) => ({ ...station, displayKey: station.id, isCircularBoundary: false }));
		const boundaryStationIds = new Set(
			serviceRoutes
				.map(({ stationIds }) => stationIds)
				.filter((stationIds) => stationIds.length > 1 && stationIds[0] === stationIds[stationIds.length - 1])
				.map(([stationId]) => stationId),
		);
		for (const stationId of boundaryStationIds) {
			const station = stations.find((item) => item.id === stationId);
			if (station) rows.push({ ...station, displayKey: `circular-boundary-${stationId}`, isCircularBoundary: true });
		}
		return rows;
	}, [serviceRoutes, stations]);
	const activeDiagramServiceRouteId = serviceRoutes.some(({ id }) => id === diagramServiceRouteId) ? diagramServiceRouteId : 'all';
	const activeTimetableServiceRouteId = serviceRoutes.some(({ id }) => id === timetableServiceRouteId) ? timetableServiceRouteId : 'all';
	const diagramStations = useMemo(() => {
		if (activeDiagramServiceRouteId === 'all') return displayStations;
		const route = serviceRoutes.find(({ id }) => id === activeDiagramServiceRouteId);
		if (!route) return displayStations;
		return route.stationIds.flatMap((stationId, index) => {
			const station = stations.find((item) => item.id === stationId);
			if (!station) return [];
			const isCircularBoundary = index === route.stationIds.length - 1 && route.stationIds.length > 1 && route.stationIds[0] === stationId;
			return [
				{
					...station,
					displayKey: isCircularBoundary ? `circular-boundary-${stationId}` : `${route.id}-${index}-${stationId}`,
					isCircularBoundary,
				},
			];
		});
	}, [activeDiagramServiceRouteId, displayStations, serviceRoutes, stations]);
	const timetableStations = useMemo(() => {
		if (activeTimetableServiceRouteId === 'all') return displayStations;
		const route = serviceRoutes.find(({ id }) => id === activeTimetableServiceRouteId);
		if (!route) return displayStations;
		return route.stationIds.flatMap((stationId, index) => {
			const station = stations.find((item) => item.id === stationId);
			if (!station) return [];
			const isCircularBoundary = index === route.stationIds.length - 1 && route.stationIds.length > 1 && route.stationIds[0] === stationId;
			return [
				{
					...station,
					displayKey: isCircularBoundary ? `circular-boundary-${stationId}` : `${route.id}-${index}-${stationId}`,
					isCircularBoundary,
				},
			];
		});
	}, [activeTimetableServiceRouteId, displayStations, serviceRoutes, stations]);
	const trainTypes = railway?.trainTypes?.length ? railway.trainTypes : DEFAULT_TRAIN_TYPES.map(({ name }) => name);
	const getTrainTypeColor = (typeName) => {
		const index = trainTypes.indexOf(typeName);
		return railway?.trainTypeColors?.[typeName] ?? TRAIN_COLORS[(index < 0 ? 0 : index) % TRAIN_COLORS.length];
	};
	const getTrainTypeTextColor = (typeName) => railway?.trainTypeTextColors?.[typeName] ?? getTrainTypeColor(typeName);
	const selectedTrain = railway?.trains.find((train) => train.id === selectedTrainId) ?? railway?.trains[0];
	const selectedOperation = operations[selectedOperationIndex];
	const selectedStation = stations.find((station) => station.id === selectedStationId) ?? stations[0];
	const timetableTrains = useMemo(() => {
		const filtered =
			railway?.trains.filter(
				(train) =>
					(activeTimetableServiceRouteId === 'all' || getTrainServiceRoute(train, serviceRoutes)?.id === activeTimetableServiceRouteId) &&
					(timetableDirection === 'all' ||
						getTrainDirection(
							train,
							serviceRoutes,
							stations.map(({ id }) => id),
						) === timetableDirection) &&
					(timetableTypeFilter === 'all' || getTrainTypeName(train) === timetableTypeFilter),
			) ?? [];
		return [...filtered].sort((first, second) => {
			if (timetableSort === 'number') return first.trainNumber.localeCompare(second.trainNumber, undefined, { numeric: true });
			if (timetableSort === 'type')
				return (
					getTrainTypeName(first).localeCompare(getTrainTypeName(second), 'ja') ||
					getTrainStartSeconds(first) - getTrainStartSeconds(second)
				);
			return getTrainStartSeconds(first) - getTrainStartSeconds(second);
		});
	}, [activeTimetableServiceRouteId, railway, serviceRoutes, stations, timetableDirection, timetableTypeFilter, timetableSort]);
	const stationTimetableTrains = useMemo(() => {
		if (!selectedStation || !railway) return [];
		return railway.trains
			.filter(
				(train) =>
					train.route.some(
						(point) => point.stationId === selectedStation.id && (point.departureTime !== null || point.arrivalTime !== null),
					) &&
					(stationDirection === 'all' ||
						getTrainDirection(
							train,
							serviceRoutes,
							stations.map(({ id }) => id),
						) === stationDirection),
			)
			.map((train) => ({
				train,
				point: train.route.find(
					(routePoint) =>
						routePoint.stationId === selectedStation.id && (routePoint.departureTime !== null || routePoint.arrivalTime !== null),
				),
			}))
			.sort((first, second) => {
				const firstTime = serviceDaySeconds(first.point.departureTime ?? first.point.arrivalTime, getTrainServiceStartTime(first.train));
				const secondTime = serviceDaySeconds(second.point.departureTime ?? second.point.arrivalTime, getTrainServiceStartTime(second.train));
				return firstTime - secondTime;
			});
	}, [railway, selectedStation, stationDirection, serviceRoutes, stations]);
	const diagramTrains = useMemo(
		() =>
			railway?.trains.filter(
				(train) =>
					(activeDiagramServiceRouteId === 'all' || getTrainServiceRoute(train, serviceRoutes)?.id === activeDiagramServiceRouteId) &&
					(diagramDirection === 'all' ||
						getTrainDirection(
							train,
							serviceRoutes,
							stations.map(({ id }) => id),
						) === diagramDirection),
			) ?? [],
		[activeDiagramServiceRouteId, railway, diagramDirection, serviceRoutes, stations],
	);
	const chartScale = viewportWidth / (visibleMinutes * 60);
	const diagramTrainPaths = useMemo(
		() =>
			diagramTrains.map((train) => ({
				train,
				points: getDiagramPoints(train, diagramStations, chartScale),
			})),
		[chartScale, diagramStations, diagramTrains],
	);
	const operationLinks = useMemo(() => {
		const pointsByTrainId = new Map(diagramTrainPaths.map(({ train, points }) => [train.id, points]));
		return (railway?.operations ?? []).flatMap((operation) =>
			operation.trainIds.slice(0, -1).flatMap((trainId, index) => {
				const nextTrainId = operation.trainIds[index + 1];
				const fromPoints = pointsByTrainId.get(trainId);
				const toPoints = pointsByTrainId.get(nextTrainId);
				const fromTrain = railway?.trains.find(({ id }) => id === trainId);
				const toTrain = railway?.trains.find(({ id }) => id === nextTrainId);
				if (!fromPoints?.length || !toPoints?.length || !fromTrain || !toTrain) return [];
				return [
					{
						id: `${operation.id}-${trainId}-${nextTrainId}`,
						operationId: operation.id,
						fromTrainNumber: fromTrain.trainNumber,
						toTrainNumber: toTrain.trainNumber,
						from: fromPoints.at(-1),
						to: toPoints[0],
					},
				];
			}),
		);
	}, [diagramTrainPaths, railway]);
	const applyImportedRailway = useCallback(
		(assigned, sourceName, showDiagram, mergeWithExisting) => {
			try {
				const current = railwayRef.current;
				const merged = mergeWithExisting && current ? mergeImportedRailway(current, assigned) : assigned;
				const firstImportedTrainNumber = assigned.trains[0]?.trainNumber.normalize('NFKC').trim();
				const firstAddedTrain =
					mergeWithExisting && current && firstImportedTrainNumber ?
						merged.trains.find((train) => train.trainNumber.normalize('NFKC').trim() === firstImportedTrainNumber)
					:	merged.trains[0];
				const nextStationId =
					mergeWithExisting && current?.stations.some((station) => station.id === selectedStationIdRef.current) ?
						selectedStationIdRef.current
					:	(merged.stations[0]?.id ?? '');
				railwayRef.current = merged;
				setRailway(merged);
				setSelectedTrainId(firstAddedTrain?.id ?? '');
				selectedStationIdRef.current = nextStationId;
				setSelectedStationId(nextStationId);
				setSelectedStop(null);
				setSelectedOperationIndex(0);
				if (showDiagram) navigateView('diagram');
				setError('');
				const passingStopCount = assigned.trains.reduce((total, train) => total + train.route.filter(({ isPassing }) => isPassing).length, 0);
				setMessage(
					mergeWithExisting ?
						`${sourceName}を既存のダイヤに結合しました（列車 ${assigned.trains.length}本・運用 ${assigned.operations.length}件・通過 ${passingStopCount}箇所）`
					:	`${sourceName}で既存のダイヤを上書きしました（列車 ${assigned.trains.length}本・運用 ${assigned.operations.length}件・通過 ${passingStopCount}箇所）`,
				);
				setPendingImport(null);
			} catch (importError) {
				setError(importError instanceof Error ? importError.message : 'ファイルを読み込めませんでした。');
				setMessage('');
				setPendingImport(null);
			}
		},
		[navigateView],
	);

	const importXml = useCallback(
		(xml, sourceName, showDiagram = true) => {
			try {
				const imported = parseOud2(xml);
				const assigned = assignOperations(imported, { defaultCarCount: 4 });
				const current = railwayRef.current;
				if (current) {
					setPendingImport({ railway: assigned, sourceName, showDiagram });
					setError('');
					setMessage('');
					return;
				}
				applyImportedRailway(assigned, sourceName, showDiagram, false);
			} catch (importError) {
				setError(importError instanceof Error ? importError.message : 'ファイルを読み込めませんでした。');
				setMessage('');
			}
		},
		[applyImportedRailway],
	);

	const cancelImport = () => {
		setPendingImport(null);
		setError('');
		setMessage('読込をキャンセルしました。既存のダイヤは変更されていません。');
	};

	useEffect(() => {
		if (!pendingImport) return undefined;
		const handleKeyDown = (event) => {
			if (event.key === 'Escape') cancelImport();
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [pendingImport]);

	useEffect(() => {
		railwayRef.current = railway;
	}, [railway]);

	useEffect(() => {
		selectedStationIdRef.current = selectedStationId;
	}, [selectedStationId]);

	useEffect(() => {
		let cancelled = false;
		const initialize = async () => {
			try {
				const store = railwayStoreRef.current ?? new IndexedDbRailwayStore();
				railwayStoreRef.current = store;
				const saved = await store.load();
				if (cancelled) return;
				if (saved) {
					railwayRef.current = saved;
					setRailway(saved);
					setSelectedTrainId(saved.trains[0]?.id ?? '');
					selectedStationIdRef.current = saved.stations[0]?.id ?? '';
					setSelectedStationId(saved.stations[0]?.id ?? '');
					setMessage('保存済みのダイヤを開きました。');
				} else {
					const sample = assignOperations(parseOud2(sampleOud2), { defaultCarCount: 4 });
					railwayRef.current = sample;
					setRailway(sample);
					setSelectedTrainId(sample.trains[0]?.id ?? '');
					selectedStationIdRef.current = sample.stations[0]?.id ?? '';
					setSelectedStationId(sample.stations[0]?.id ?? '');
					setMessage('サンプルダイヤを開きました。編集内容は自動保存されます。');
				}
				persistenceReadyRef.current = true;
			} catch (loadError) {
				if (cancelled) return;
				setError(loadError instanceof Error ? loadError.message : '保存済みダイヤを読み込めませんでした。');
				setMessage('');
			} finally {
				if (!cancelled) setIsLoadingRailway(false);
			}
		};
		void initialize();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!railway || !persistenceReadyRef.current || !railwayStoreRef.current) return;
		const timeout = setTimeout(() => {
			saveQueueRef.current = saveQueueRef.current
				.then(async () => {
					await railwayStoreRef.current?.save(railway);
					setError((current) => (current.startsWith('自動保存に失敗') ? '' : current));
				})
				.catch((saveError) => {
					setError(saveError instanceof Error ? `自動保存に失敗しました: ${saveError.message}` : '自動保存に失敗しました。');
					setMessage('');
				});
		}, 250);
		return () => clearTimeout(timeout);
	}, [railway]);

	useEffect(() => {
		if (importRequest > 0 && !isLoadingRailway) importInput.current?.click();
	}, [importRequest, isLoadingRailway]);

	useEffect(() => {
		const viewport = chartViewport.current;
		if (!viewport) return undefined;

		const resizeObserver = new ResizeObserver((entries) => {
			setViewportWidth(Math.max(280, entries[0].contentRect.width));
		});
		resizeObserver.observe(viewport);
		return () => resizeObserver.disconnect();
	}, [railway, activeTab]);

	const chartWidth = Math.ceil(chartScale * SERVICE_DURATION_SECONDS);
	const chartHeight = diagramStations.length * ROW_HEIGHT;
	const minuteWidth = 60 * chartScale;
	const tickMinutes =
		visibleMinutes <= 30 ? 5
		: visibleMinutes <= 75 ? 15
		: 30;

	useEffect(() => {
		chartScaleRef.current = chartScale;
	}, [chartScale]);

	useEffect(() => {
		const viewport = chartViewport.current;
		if (!viewport || !railway) return;
		const earliest =
			railway.trains
				.flatMap((train) =>
					train.route
						.map((point) => point.departureTime ?? point.arrivalTime)
						.filter(Boolean)
						.map((time) => serviceDaySeconds(time, getTrainServiceStartTime(train))),
				)
				.sort((left, right) => left - right)[0] ?? 6 * 3600;
		viewport.scrollLeft = Math.max(0, chartScaleRef.current * (earliest - SERVICE_DAY_START_SECONDS - 3600));
	}, [railway, viewportWidth, activeTab]);

	const handleFile = async (event) => {
		const file = event.target.files?.[0];
		if (!file) return;
		try {
			importXml(decodeOud2File(await file.arrayBuffer()), file.name);
		} catch (fileError) {
			setError(fileError instanceof Error ? fileError.message : 'ファイルを読み込めませんでした。');
			setMessage('');
		} finally {
			event.target.value = '';
		}
	};

	const updateTrain = (trainId, update) => {
		setRailway((current) => ({
			...current,
			trains: current.trains.map((train) => (train.id === trainId ? update(train) : train)),
		}));
	};

	const updateRouteTime = (trainId, routeIndex, field, value) => {
		updateTrain(trainId, (train) => ({
			...train,
			route: train.route.map((point, index) =>
				index === routeIndex ?
					point.isPassing ?
						{ ...point, arrivalTime: value, departureTime: value }
					:	{ ...point, [field]: value }
				:	point,
			),
		}));
	};

	const updateRoutePoint = (trainId, routeIndex, update) => {
		updateTrain(trainId, (train) => ({
			...train,
			route: train.route.map((point, index) => (index === routeIndex ? update(point) : point)),
		}));
	};

	const updateRouteEvent = (trainId, routeIndex, eventType) => {
		if (!eventType) {
			updateRoutePoint(trainId, routeIndex, (point) => ({ ...point, operationEvent: null }));
			return;
		}
		if (!operations.length) {
			setError('併結・解放を設定する前に運用を追加してください。');
			return;
		}
		updateRoutePoint(trainId, routeIndex, (point) => ({
			...point,
			operationEvent: {
				type: eventType,
				operationId: point.operationEvent?.operationId ?? operations[0].id,
				targetTrainId: eventType === 'split' ? (point.operationEvent?.targetTrainId ?? null) : null,
			},
		}));
	};

	const moveTrainRouteStation = (trainId, routeIndex, direction) => {
		updateTrain(trainId, (train) => {
			const targetIndex = routeIndex + direction;
			if (targetIndex <= 0 || targetIndex >= train.route.length - 1) return train;
			const route = [...train.route];
			const currentPoint = route[routeIndex];
			route[routeIndex] = route[targetIndex];
			route[targetIndex] = currentPoint;
			return { ...train, route, serviceRouteId: undefined };
		});
	};

	const addTrain = () => {
		if (stations.length < 2) {
			setError('列車を追加するには駅を2つ以上登録してください。');
			setMessage('');
			navigateView('manage');
			return;
		}
		const id = makeUniqueId(
			'train',
			railway.trains.map((train) => train.id),
		);
		const origin = stations[0];
		const destination = stations[1];
		const train = {
			id,
			trainNumber: `新列車${railway.trains.length + 1}`,
			type: 'Local',
			typeName: trainTypes[0] ?? '普通',
			currentOperationIds: [],
			originStationId: origin.id,
			destinationStationId: destination.id,
			route: [
				{ stationId: origin.id, arrivalTime: null, departureTime: '08:00:00', trackNumber: '', operationEvent: null },
				{ stationId: destination.id, arrivalTime: '08:10:00', departureTime: null, trackNumber: '', operationEvent: null },
			],
			isDepotIn: false,
			isDepotOut: false,
		};
		setRailway((current) => ({ ...current, trains: [...current.trains, train] }));
		setSelectedTrainId(id);
		setSelectedStop(null);
		setError('');
		setMessage('列車を追加しました。列車番号・経由駅・時刻を編集してください。');
		navigateView('train');
	};

	const removeTrain = (trainId) => {
		const remaining = railway.trains.filter((train) => train.id !== trainId);
		setRailway((current) => ({
			...current,
			operations: current.operations
				.map((operation) => ({ ...operation, trainIds: operation.trainIds.filter((id) => id !== trainId) }))
				.filter((operation) => operation.trainIds.length > 0),
			trains: remaining.map((train) => ({
				...train,
				currentOperationIds: train.currentOperationIds.filter((operationId) =>
					current.operations.some((operation) => operation.id === operationId && operation.trainIds.some((id) => id !== trainId)),
				),
				route: train.route.map((point) =>
					point.operationEvent?.targetTrainId === trainId ?
						{ ...point, operationEvent: { ...point.operationEvent, targetTrainId: null } }
					:	point,
				),
			})),
		}));
		setSelectedTrainId(remaining[0]?.id ?? '');
		setSelectedStop(null);
		setMessage('列車を削除しました。');
	};

	const addTrainRouteStation = (trainId, stationId) => {
		if (!stationId) return;
		setRailway((current) => {
			const train = current.trains.find((item) => item.id === trainId);
			if (!train || train.route.some((point) => point.stationId === stationId) || train.route.length < 2) return current;
			const route = [...train.route];
			const insertAt = route.length - 1;
			route.splice(insertAt, 0, {
				stationId,
				arrivalTime: null,
				departureTime: null,
				trackNumber: '',
				operationEvent: null,
				isPassing: true,
			});
			return {
				...current,
				trains: current.trains.map((item) => (item.id === trainId ? { ...item, route, serviceRouteId: undefined } : item)),
			};
		});
	};

	const removeTrainRouteStation = (trainId, routeIndex) => {
		setRailway((current) => ({
			...current,
			trains: current.trains.map((train) => {
				if (train.id !== trainId || train.route.length <= 2) return train;
				const route = train.route.filter((_, index) => index !== routeIndex);
				return {
					...train,
					route,
					originStationId: route[0].stationId,
					destinationStationId: route.at(-1).stationId,
					serviceRouteId: undefined,
				};
			}),
		}));
	};

	const togglePassing = (trainId, routeIndex) => {
		updateTrain(trainId, (train) => ({
			...train,
			route: train.route.map((point, index) => {
				if (index !== routeIndex) return point;
				if (point.isPassing) {
					const arrivalTime = point.arrivalTime ?? point.departureTime;
					const departureTime =
						arrivalTime && timeToSeconds(arrivalTime) < 359940 ? secondsToTime(timeToSeconds(arrivalTime) + 60) : arrivalTime;
					return { ...point, isPassing: false, arrivalTime, departureTime };
				}
				const passTime = point.departureTime ?? point.arrivalTime;
				return { ...point, isPassing: true, arrivalTime: passTime, departureTime: passTime };
			}),
		}));
	};

	const addOperation = () => {
		const operation = {
			id: makeUniqueId(
				'OP',
				railway.operations.map(({ id }) => id),
			),
			carCount: 4,
			trainIds: [],
		};
		setRailway((current) => ({ ...current, operations: [...current.operations, operation] }));
		setSelectedOperationIndex(railway.operations.length);
		setMessage('運用を追加しました。列車を割り当ててください。');
	};

	const updateOperation = (operationId, update) => {
		const previous = railway.operations.find((operation) => operation.id === operationId);
		if (!previous) return;
		const updated = update(previous);
		if (updated.id !== operationId && railway.operations.some((operation) => operation.id === updated.id)) {
			setError(`運用番号「${updated.id}」はすでに使用されています。`);
			return;
		}
		setRailway((current) => ({
			...current,
			operations: current.operations.map((operation) => (operation.id === operationId ? updated : operation)),
			trains:
				updated.id === operationId ?
					current.trains
				:	current.trains.map((train) => ({
						...train,
						currentOperationIds: train.currentOperationIds.map((id) => (id === operationId ? updated.id : id)),
						route: train.route.map((point) =>
							point.operationEvent?.operationId === operationId ?
								{ ...point, operationEvent: { ...point.operationEvent, operationId: updated.id } }
							:	point,
						),
					})),
		}));
	};

	const toggleTrainInOperation = (operationId, trainId, included) => {
		setRailway((current) => ({
			...current,
			operations: current.operations.map((operation) =>
				operation.id !== operationId ?
					operation
				:	{
						...operation,
						trainIds: included ? [...operation.trainIds, trainId] : operation.trainIds.filter((id) => id !== trainId),
					},
			),
			trains: current.trains.map((train) =>
				train.id !== trainId ?
					train
				:	{
						...train,
						currentOperationIds:
							included ?
								[...new Set([...train.currentOperationIds, operationId])]
							:	train.currentOperationIds.filter((id) => id !== operationId),
					},
			),
		}));
	};

	const removeOperation = (operationId) => {
		const nextOperations = railway.operations.filter((operation) => operation.id !== operationId);
		setRailway((current) => ({
			...current,
			operations: nextOperations,
			trains: current.trains.map((train) => ({
				...train,
				currentOperationIds: train.currentOperationIds.filter((id) => id !== operationId),
				route: train.route.map((point) => (point.operationEvent?.operationId === operationId ? { ...point, operationEvent: null } : point)),
			})),
		}));
		setSelectedOperationIndex(Math.max(0, Math.min(selectedOperationIndex, nextOperations.length - 1)));
	};

	const applyServiceRouteToTrain = (trainId, serviceRouteId) => {
		const serviceRoute = serviceRoutes.find((route) => route.id === serviceRouteId);
		if (!serviceRoute) {
			updateTrain(trainId, (train) => ({ ...train, serviceRouteId: undefined }));
			return;
		}
		if (serviceRoute.stationIds.length < 2) {
			setError('運行系統には2駅以上の経由駅が必要です。');
			setMessage('');
			return;
		}
		updateTrain(trainId, (train) => {
			const currentPoints = new Map(train.route.map((point) => [point.stationId, point]));
			const route = serviceRoute.stationIds.map((stationId, index) => {
				const existing = currentPoints.get(stationId);
				const isFirst = index === 0;
				const isLast = index === serviceRoute.stationIds.length - 1;
				return {
					stationId,
					arrivalTime: isFirst ? null : (existing?.arrivalTime ?? null),
					departureTime: isLast ? null : (existing?.departureTime ?? null),
					trackNumber: existing?.trackNumber ?? '',
					operationEvent: existing?.operationEvent ?? null,
				};
			});
			return {
				...train,
				serviceRouteId,
				originStationId: serviceRoute.stationIds[0],
				destinationStationId: serviceRoute.stationIds.at(-1),
				route,
			};
		});
	};

	const generateOperations = () => {
		try {
			const expectedCarCounts = Object.fromEntries(
				railway.trains.filter((train) => train.carCount !== undefined).map((train) => [train.id, train.carCount]),
			);
			const operationCarCounts = Object.fromEntries(railway.operations.map((operation) => [operation.id, operation.carCount]));
			const generated = assignOperations(railway, {
				defaultCarCount: 4,
				expectedCarCounts,
				operationCarCounts,
			});
			setRailway(generated);
			setSelectedOperationIndex(0);
			setError('');
			setMessage(`運用を自動生成しました（${generated.operations.length}件）`);
		} catch (generationError) {
			setError(generationError instanceof Error ? generationError.message : '運用を生成できませんでした。');
			setMessage('');
		}
	};

	const addStation = (name = newStationName) => {
		const trimmedName = name.trim();
		if (!trimmedName) {
			newStationInput.current?.focus();
			return;
		}
		setRailway((current) => {
			const station = {
				id: makeUniqueId(
					'station',
					current.stations.map(({ id }) => id),
				),
				name: trimmedName,
				kilopost: current.stations.length ? Math.max(...current.stations.map(({ kilopost }) => kilopost)) + 1 : 0,
				hasTracks: false,
				canTurnBack: false,
				isDepot: false,
				depotCapacity: null,
			};
			return { ...current, stations: [...current.stations, station] };
		});
		setNewStationName('');
		requestAnimationFrame(() => newStationInput.current?.focus());
	};

	const removeStation = (stationId) => {
		setRailway((current) => ({
			...current,
			stations: current.stations.filter((station) => station.id !== stationId),
			serviceRoutes: (current.serviceRoutes ?? [])
				.map((route) => ({ ...route, stationIds: route.stationIds.filter((id) => id !== stationId) }))
				.filter((route) => route.stationIds.length >= 2),
			trains: current.trains.map((train) => {
				const stillExists = (current.serviceRoutes ?? []).some((route) => route.id === train.serviceRouteId && route.stationIds.length >= 2);
				return stillExists ? train : { ...train, serviceRouteId: undefined };
			}),
		}));
	};

	const addServiceRoute = () => {
		if (stations.length < 2) {
			setError('運行系統を作成するには、駅を2つ以上追加してください。');
			setMessage('');
			return;
		}
		setRailway((current) => {
			const routes = current.serviceRoutes ?? [];
			const id = makeUniqueId(
				'system',
				routes.map(({ id: routeId }) => routeId),
			);
			const stationIds = current.stations.slice(0, 2).map(({ id: stationId }) => stationId);
			return {
				...current,
				serviceRoutes: [
					...routes,
					{
						id,
						name: `新しい系統 ${routes.length + 1}`,
						stationIds,
					},
				],
			};
		});
		setError('');
	};

	const updateServiceRoute = (routeId, update) => {
		setRailway((current) => {
			const serviceRoutes = (current.serviceRoutes ?? []).map((route) => (route.id === routeId ? update(route) : route));
			return { ...current, serviceRoutes };
		});
	};

	const removeServiceRoute = (routeId) => {
		setRailway((current) => ({
			...current,
			serviceRoutes: (current.serviceRoutes ?? []).filter(({ id }) => id !== routeId),
			trains: current.trains.map((train) => (train.serviceRouteId === routeId ? { ...train, serviceRouteId: undefined } : train)),
		}));
	};

	const addTrainType = () => {
		setRailway((current) => {
			const base = '新しい種別';
			let name = base;
			let suffix = 2;
			const currentTypes = current.trainTypes?.length ? current.trainTypes : DEFAULT_TRAIN_TYPES.map(({ name: typeName }) => typeName);
			while (currentTypes.includes(name)) {
				name = `${base} ${suffix}`;
				suffix += 1;
			}
			return { ...current, trainTypes: [...currentTypes, name] };
		});
	};

	const updateTrainType = (oldName, name) => {
		const defaultType = DEFAULT_TRAIN_TYPES.find(({ name: typeName }) => typeName === oldName)?.type;
		setRailway((current) => {
			const currentTypes = current.trainTypes?.length ? current.trainTypes : DEFAULT_TRAIN_TYPES.map(({ name: typeName }) => typeName);
			const renameColor = (colors) => {
				if (!colors || oldName === name || !colors[oldName]) return colors;
				const { [oldName]: color, ...remainingColors } = colors;
				return { ...remainingColors, [name]: color };
			};
			return {
				...current,
				trainTypes: currentTypes.map((currentName) => (currentName === oldName ? name : currentName)),
				trainTypeColors: renameColor(current.trainTypeColors),
				trainTypeTextColors: renameColor(current.trainTypeTextColors),
				trains: current.trains.map((train) =>
					train.typeName === oldName || (!train.typeName && train.type === defaultType) ?
						{ ...train, typeName: name, type: inferTrainType(name) }
					:	train,
				),
			};
		});
	};

	const updateTrainTypeColor = (typeName, color, isTextColor = false) => {
		const key = isTextColor ? 'trainTypeTextColors' : 'trainTypeColors';
		setRailway((current) => ({
			...current,
			[key]: { ...(current[key] ?? {}), [typeName]: color },
		}));
	};

	const removeTrainType = (name) => {
		const removedDefaultType = DEFAULT_TRAIN_TYPES.find(({ name: typeName }) => typeName === name)?.type;
		setRailway((current) => {
			const currentTypes = current.trainTypes?.length ? current.trainTypes : DEFAULT_TRAIN_TYPES.map(({ name: typeName }) => typeName);
			const remainingTypes = currentTypes.filter((typeName) => typeName !== name);
			const fallback = remainingTypes[0] ?? DEFAULT_TRAIN_TYPES[0].name;
			return {
				...current,
				trainTypes: remainingTypes,
				trainTypeColors: Object.fromEntries(Object.entries(current.trainTypeColors ?? {}).filter(([typeName]) => typeName !== name)),
				trainTypeTextColors: Object.fromEntries(Object.entries(current.trainTypeTextColors ?? {}).filter(([typeName]) => typeName !== name)),
				trains: current.trains.map((train) =>
					train.typeName === name || (!train.typeName && train.type === removedDefaultType) ?
						{ ...train, typeName: fallback, type: inferTrainType(fallback) }
					:	train,
				),
			};
		});
	};

	const onTrainPointerDown = (event, train) => {
		event.stopPropagation();
		if (event.pointerType === 'touch') return;
		event.currentTarget.setPointerCapture(event.pointerId);
		dragState.current = { pointerId: event.pointerId, trainId: train.id, startX: event.clientX, moved: false };
		setDraggedTrainId(train.id);
	};

	const onTrainPointerMove = (event) => {
		const currentDrag = dragState.current;
		if (!currentDrag || currentDrag.pointerId !== event.pointerId) return;
		const rawDelta = (event.clientX - currentDrag.startX) / chartScale + (currentDrag.remainder ?? 0);
		const delta = Math.round(rawDelta / 30) * 30;
		currentDrag.remainder = rawDelta - delta;
		currentDrag.startX = event.clientX;
		if (delta === 0) return;
		currentDrag.moved = true;
		updateTrain(currentDrag.trainId, (train) => shiftTrain(train, delta));
	};

	const stopTrainDrag = (event) => {
		if (dragState.current?.pointerId !== event.pointerId) return;
		if (dragState.current.moved) {
			suppressTrainClickRef.current = true;
			setTimeout(() => {
				suppressTrainClickRef.current = false;
			}, 0);
		}
		dragState.current = null;
		setDraggedTrainId('');
	};

	useEffect(() => {
		const viewport = chartViewport.current;
		if (!viewport) return undefined;

		const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
		const onTouchStart = (event) => {
			if (event.touches.length === 2) {
				pinchState.current = { distance: distance(event.touches), minutes: visibleMinutes };
				event.preventDefault();
			}
		};
		const onTouchMove = (event) => {
			if (event.touches.length !== 2 || !pinchState.current) return;
			event.preventDefault();
			const ratio = pinchState.current.distance / Math.max(1, distance(event.touches));
			const nextMinutes = Math.max(MIN_VISIBLE_MINUTES, Math.min(MAX_VISIBLE_MINUTES, pinchState.current.minutes * ratio));
			const rect = viewport.getBoundingClientRect();
			const centerX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
			const centerOffset = centerX - rect.left;
			const currentScale = chartScaleRef.current;
			const centerTime = (viewport.scrollLeft + centerOffset) / currentScale;
			const nextScale = (currentScale * visibleMinutes) / nextMinutes;
			setVisibleMinutes(nextMinutes);
			requestAnimationFrame(() => {
				viewport.scrollLeft = Math.max(0, centerTime * nextScale - centerOffset);
			});
		};
		const onTouchEnd = (event) => {
			if (event.touches.length < 2) pinchState.current = null;
		};

		viewport.addEventListener('touchstart', onTouchStart, { passive: false });
		viewport.addEventListener('touchmove', onTouchMove, { passive: false });
		viewport.addEventListener('touchend', onTouchEnd);
		viewport.addEventListener('touchcancel', onTouchEnd);
		return () => {
			viewport.removeEventListener('touchstart', onTouchStart);
			viewport.removeEventListener('touchmove', onTouchMove);
			viewport.removeEventListener('touchend', onTouchEnd);
			viewport.removeEventListener('touchcancel', onTouchEnd);
		};
	}, [visibleMinutes, railway, activeTab]);

	const moveOperation = (delta) => {
		setSelectedOperationIndex((index) => (operations.length ? (index + delta + operations.length) % operations.length : 0));
	};

	const setZoom = (direction) => {
		setVisibleMinutes((minutes) => Math.max(MIN_VISIBLE_MINUTES, Math.min(MAX_VISIBLE_MINUTES, minutes * direction)));
	};

	return (
		<main className='railway-editor min-h-0 flex-1'>
			<header className='editor-topbar'>
				<div className='editor-brand'>
					<span className='brand-mark' aria-hidden='true'>
						線
					</span>
					<div className='brand-copy'>
						<strong>{railway?.railwayName ?? 'ダイヤエディタ'}</strong>
						<span>TIMETABLE STUDIO</span>
					</div>
				</div>
				<div className='topbar-actions'>
					<button
						className='icon-button'
						type='button'
						onClick={() => importInput.current?.click()}
						aria-label='oud2を読み込む'
						disabled={isLoadingRailway}
					>
						<span aria-hidden='true'>⇧</span>
					</button>
					<input
						ref={importInput}
						className='visually-hidden'
						type='file'
						accept='.oud,.oud2,.xml,application/xml,text/xml'
						onChange={handleFile}
						disabled={isLoadingRailway}
					/>
					<button className='import-button' type='button' onClick={() => importInput.current?.click()} disabled={isLoadingRailway}>
						<span aria-hidden='true'>＋</span> <span className='import-button-label'>.oud2 読込</span>
					</button>
				</div>
			</header>

			<section className='workspace'>
				<div className='workspace-heading'>
					<div>
						<p className='eyebrow'>
							{stations.length} STATIONS · {serviceRoutes.length} OPERATING SYSTEMS
						</p>
						<h1>運行ダイヤ</h1>
					</div>
					<div className='heading-stats'>
						<span>
							<b>{railway?.trains.length ?? 0}</b> 列車
						</span>
						<span>
							<b>{operations.length}</b> 運用
						</span>
						<button className='heading-add-train-button' type='button' onClick={addTrain}>
							＋ 列車
						</button>
						<button
							className='heading-import-button'
							type='button'
							onClick={() => importInput.current?.click()}
							disabled={isLoadingRailway}
						>
							＋ 読込
						</button>
					</div>
				</div>

				{(message || error) && (
					<div className={`import-feedback${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
						<span aria-hidden='true'>{error ? '!' : '✓'}</span>
						{error || message}
					</div>
				)}
				{isLoadingRailway && (
					<div className='import-feedback' role='status'>
						保存済みダイヤを読み込んでいます…
					</div>
				)}

				<div className='editor-tabs' role='tablist' aria-label='編集モード'>
					<button
						type='button'
						role='tab'
						aria-selected={activeTab === 'diagram'}
						className={activeTab === 'diagram' ? 'is-active' : ''}
						onClick={() => navigateView('diagram')}
					>
						<span aria-hidden='true'>⌁</span> ダイヤ
					</button>
					<button
						type='button'
						role='tab'
						aria-selected={activeTab === 'train'}
						className={activeTab === 'train' ? 'is-active' : ''}
						onClick={() => navigateView('train')}
					>
						<span aria-hidden='true'>▤</span> 列車編集
					</button>
					<button
						type='button'
						role='tab'
						aria-selected={activeTab === 'operation'}
						className={activeTab === 'operation' ? 'is-active' : ''}
						onClick={() => navigateView('operation')}
					>
						<span aria-hidden='true'>⇄</span> 運用
					</button>
					<button
						type='button'
						role='tab'
						aria-selected={activeTab === 'manage'}
						className={activeTab === 'manage' ? 'is-active' : ''}
						onClick={() => navigateView('manage')}
					>
						<span aria-hidden='true'>⌘</span> 駅・系統
					</button>
				</div>

				{activeTab === 'diagram' && (
					<section className='diagram-card' aria-label='ダイヤグラム'>
						<div className='diagram-toolbar'>
							<div className='legend'>
								<span className='legend-line' /> 運転スジ
							</div>
							<span className='diagram-edit-hint'>停車点タップで時刻編集</span>
							<span className='operation-link-legend'>
								<i /> 運用つながり
							</span>
							<label className='diagram-service-filter'>
								<span>系統</span>
								<select
									aria-label='ダイヤグラムの運行系統'
									value={activeDiagramServiceRouteId}
									onChange={(event) => setDiagramServiceRouteId(event.target.value)}
								>
									<option value='all'>すべて</option>
									{serviceRoutes.map((route) => (
										<option value={route.id} key={route.id}>
											{route.name}
										</option>
									))}
								</select>
							</label>
							<div className='diagram-view-options' role='group' aria-label='ダイヤ表示設定'>
								<button
									type='button'
									className={diagramDirection === 'all' ? 'is-active' : ''}
									aria-pressed={diagramDirection === 'all'}
									onClick={() => setDiagramDirection('all')}
								>
									全
								</button>
								<button
									type='button'
									className={diagramDirection === 'down' ? 'is-active' : ''}
									aria-pressed={diagramDirection === 'down'}
									onClick={() => setDiagramDirection('down')}
								>
									下
								</button>
								<button
									type='button'
									className={diagramDirection === 'up' ? 'is-active' : ''}
									aria-pressed={diagramDirection === 'up'}
									onClick={() => setDiagramDirection('up')}
								>
									上
								</button>
								<button
									type='button'
									className={showTrainLabels ? 'is-active' : ''}
									aria-pressed={showTrainLabels}
									onClick={() => setShowTrainLabels((visible) => !visible)}
								>
									番号
								</button>
							</div>
							<div className='zoom-controls'>
								<button type='button' aria-label='縮小' onClick={() => setZoom(1.25)}>
									−
								</button>
								<span>{Math.round(visibleMinutes)}分</span>
								<button type='button' aria-label='拡大' onClick={() => setZoom(0.8)}>
									＋
								</button>
							</div>
						</div>
						{selectedStop &&
							(() => {
								const train = railway?.trains.find((item) => item.id === selectedStop.trainId);
								const point = train?.route[selectedStop.routeIndex];
								const station = railway?.stations.find((item) => item.id === point?.stationId);
								if (!train || !point || !station) return null;
								return (
									<div className='stop-time-editor' aria-label={`${station.name}での時刻編集`}>
										<div className='stop-editor-station'>
											<span className='stop-editor-dot' />
											<div>
												<strong>{station.name}</strong>
												<span>{train.trainNumber} の時刻</span>
											</div>
										</div>
										{point.isPassing ?
											<DigitTimeInput
												key={`pass-${selectedStop.routeIndex}-${point.arrivalTime ?? point.departureTime ?? ''}`}
												label='通過'
												value={point.arrivalTime ?? point.departureTime}
												onChange={(value) => updateRouteTime(train.id, selectedStop.routeIndex, 'arrivalTime', value)}
											/>
										:	<>
												<DigitTimeInput
													key={`arrival-${selectedStop.routeIndex}-${point.arrivalTime ?? ''}`}
													label='着'
													value={point.arrivalTime}
													onChange={(value) => updateRouteTime(train.id, selectedStop.routeIndex, 'arrivalTime', value)}
												/>
												<DigitTimeInput
													key={`departure-${selectedStop.routeIndex}-${point.departureTime ?? ''}`}
													label='発'
													value={point.departureTime}
													onChange={(value) => updateRouteTime(train.id, selectedStop.routeIndex, 'departureTime', value)}
												/>
											</>
										}
										<button
											className='open-train-editor'
											type='button'
											onClick={() => {
												setSelectedTrainId(train.id);
												navigateView('train');
											}}
										>
											列車編集
										</button>
										<button
											className='close-stop-editor'
											type='button'
											aria-label='時刻編集を閉じる'
											onClick={() => setSelectedStop(null)}
										>
											×
										</button>
									</div>
								);
							})()}
						{railway && (
							<div className='diagram-grid'>
								<div className='station-viewport' ref={stationViewport} aria-hidden='true'>
									<div className='station-axis-spacer' />
									{diagramStations.map((station) => (
										<div
											className={`station-label${station.isCircularBoundary ? ' is-circular-boundary' : ''}`}
											key={station.displayKey}
											title={station.name}
										>
											{station.name}
										</div>
									))}
								</div>
								<div
									className='time-viewport'
									ref={chartViewport}
									onScroll={(event) => {
										if (stationViewport.current) stationViewport.current.scrollTop = event.currentTarget.scrollTop;
									}}
									onPointerMove={onTrainPointerMove}
									onPointerUp={stopTrainDrag}
									onPointerCancel={stopTrainDrag}
								>
									<div className='time-ruler' style={{ width: chartWidth }}>
										{Array.from({ length: Math.floor(SERVICE_DURATION_SECONDS / (tickMinutes * 60)) + 1 }, (_, index) => {
											const elapsedSeconds = index * tickMinutes * 60;
											if (elapsedSeconds > SERVICE_DURATION_SECONDS) return null;
											return (
												<div
													className={`time-tick${elapsedSeconds % 3600 === 0 ? ' is-hour' : ''}`}
													key={elapsedSeconds}
													style={{ left: elapsedSeconds * chartScale }}
												>
													<span>{getTimeLabel(SERVICE_DAY_START_SECONDS + elapsedSeconds)}</span>
												</div>
											);
										})}
									</div>
									<svg
										className='timetable-svg'
										width={chartWidth}
										height={chartHeight}
										role='img'
										aria-label='駅を縦軸、時刻を横軸にした列車ダイヤ'
									>
										<defs>
											<pattern id='minute-grid' width={minuteWidth} height={chartHeight} patternUnits='userSpaceOnUse'>
												<path d={`M 0 0 V ${chartHeight}`} className='minute-grid-line' />
											</pattern>
										</defs>
										<rect width={chartWidth} height={chartHeight} fill='url(#minute-grid)' pointerEvents='none' />
										{diagramStations.map((station, index) => (
											<g key={station.displayKey}>
												<line
													x1='0'
													x2={chartWidth}
													y1={index * ROW_HEIGHT + ROW_HEIGHT / 2}
													y2={index * ROW_HEIGHT + ROW_HEIGHT / 2}
													className='station-grid-line'
												/>
											</g>
										))}
										{diagramStations.length > 0 && (
											<defs>
												<marker
													id='operation-link-arrow'
													markerWidth='7'
													markerHeight='7'
													refX='6'
													refY='3.5'
													orient='auto'
													markerUnits='strokeWidth'
												>
													<path d='M 0 0 L 7 3.5 L 0 7 z' className='operation-link-arrow' />
												</marker>
											</defs>
										)}
										{operationLinks.map((link) => (
											<path
												className='operation-link'
												d={`M ${link.from.x} ${link.from.y} Q ${(link.from.x + link.to.x) / 2} ${(link.from.y + link.to.y) / 2 - 14} ${link.to.x} ${link.to.y}`}
												key={link.id}
												markerEnd='url(#operation-link-arrow)'
											>
												<title>
													{link.operationId}: {link.fromTrainNumber} → {link.toTrainNumber}
												</title>
											</path>
										))}
										{diagramTrainPaths.map(({ train, points }) => {
											const color = getTrainTypeColor(getTrainTypeName(train));
											if (points.length < 2) return null;
											const isSelected = selectedTrain?.id === train.id;
											return (
												<g
													className={`train-path${isSelected ? ' is-selected' : ''}${draggedTrainId === train.id ? ' is-dragging' : ''}`}
													key={train.id}
													onPointerDown={(event) => {
														setSelectedTrainId(train.id);
														onTrainPointerDown(event, train);
													}}
													onClick={(event) => {
														if (suppressTrainClickRef.current) {
															suppressTrainClickRef.current = false;
															return;
														}
														const bounds = event.currentTarget.ownerSVGElement.getBoundingClientRect();
														const x = event.clientX - bounds.left;
														const y = event.clientY - bounds.top;
														const nearest = points.reduce(
															(closest, point) => {
																const distance = Math.hypot(point.x - x, point.y - y);
																return distance < closest.distance ? { point, distance } : closest;
															},
															{ point: points[0], distance: Number.POSITIVE_INFINITY },
														);
														setSelectedTrainId(train.id);
														setSelectedStop({ trainId: train.id, routeIndex: nearest.point.routeIndex });
													}}
													style={{ '--train-color': color }}
												>
													<polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} />
													<polyline
														className='train-hit-area'
														points={points.map((point) => `${point.x},${point.y}`).join(' ')}
													/>
													{showTrainLabels && (
														<text x={points[0].x + 5} y={points[0].y - 7} className='train-label'>
															{train.trainNumber}
														</text>
													)}
												</g>
											);
										})}
									</svg>
									<div className='chart-hint'>スジを左右にドラッグして時刻を調整</div>
								</div>
							</div>
						)}
					</section>
				)}

				{activeTab === 'train' && railway && (
					<>
						<div className='train-list-toolbar'>
							<span>{railway.trains.length}本の列車</span>
							<button type='button' className='manage-add-button' onClick={addTrain}>
								＋ 列車を追加
							</button>
							{selectedTrain && (
								<button type='button' className='manage-remove-button' onClick={() => removeTrain(selectedTrain.id)}>
									この列車を削除
								</button>
							)}
						</div>
						{selectedTrain ?
							<section className='detail-card train-editor'>
								<div className='detail-card-heading'>
									<div>
										<button className='train-editor-back' type='button' onClick={() => returnToPreviousView()}>
											<span aria-hidden='true'>←</span> 戻る
										</button>
										<p className='eyebrow'>TRAIN / {getTrainTypeName(selectedTrain)}</p>
										<h2>
											{selectedTrain.trainNumber}
											{selectedTrain.trainName ? ` · ${selectedTrain.trainName}` : ''}
										</h2>
									</div>
									<select
										aria-label='編集する列車'
										value={selectedTrain.id}
										onChange={(event) => setSelectedTrainId(event.target.value)}
									>
										{railway.trains.map((train) => (
											<option value={train.id} key={train.id}>
												{train.trainNumber}
											</option>
										))}
									</select>
								</div>
								<div className='train-metadata-editor'>
									<label>
										<span>列車番号</span>
										<input
											type='text'
											value={selectedTrain.trainNumber}
											onChange={(event) =>
												updateTrain(selectedTrain.id, (train) => ({ ...train, trainNumber: event.target.value }))
											}
										/>
									</label>
									<label>
										<span>種別</span>
										<select
											value={
												selectedTrain.typeName ??
												DEFAULT_TRAIN_TYPES.find(({ type }) => type === selectedTrain.type)?.name ??
												trainTypes[0]
											}
											onChange={(event) =>
												updateTrain(selectedTrain.id, (train) => ({
													...train,
													typeName: event.target.value,
													type: inferTrainType(event.target.value),
												}))
											}
										>
											{trainTypes.map((typeName) => (
												<option value={typeName} key={typeName}>
													{typeName}
												</option>
											))}
										</select>
									</label>
									<label>
										<span>列車名</span>
										<input
											type='text'
											value={selectedTrain.trainName ?? ''}
											onChange={(event) =>
												updateTrain(selectedTrain.id, (train) => ({ ...train, trainName: event.target.value }))
											}
										/>
									</label>
									<label>
										<span>号数</span>
										<input
											type='number'
											min='1'
											step='1'
											value={selectedTrain.carCount ?? ''}
											onChange={(event) => {
												const value = event.target.value;
												updateTrain(selectedTrain.id, (train) => ({
													...train,
													carCount: value === '' ? undefined : Math.max(1, Math.floor(Number(value))),
												}));
											}}
										/>
									</label>
								</div>
								<label className='train-service-route'>
									<span>運行系統（選択すると経由駅を列車に適用）</span>
									<select
										aria-label='運行系統'
										value={selectedTrain.serviceRouteId ?? ''}
										onChange={(event) => applyServiceRouteToTrain(selectedTrain.id, event.target.value)}
									>
										<option value=''>未設定</option>
										{serviceRoutes.map((route) => (
											<option value={route.id} key={route.id}>
												{route.name}
											</option>
										))}
									</select>
								</label>
								<div className='train-endpoint-editor'>
									<label>
										<span>始発駅</span>
										<select
											value={selectedTrain.originStationId}
											onChange={(event) =>
												updateTrain(selectedTrain.id, (train) => ({
													...(() => {
														const originIndex = train.route.findIndex((point) => point.stationId === event.target.value);
														const route = originIndex < 0 ? train.route : train.route.slice(originIndex);
														return {
															originStationId: route[0]?.stationId ?? train.originStationId,
															destinationStationId: route.at(-1)?.stationId ?? train.destinationStationId,
															route: route.map((point, index) =>
																index === 0 ? { ...point, arrivalTime: null, isPassing: false } : point,
															),
															serviceRouteId: undefined,
														};
													})(),
												}))
											}
										>
											{selectedTrain.route.map((point, index) => {
												const station = stations.find((item) => item.id === point.stationId);
												return (
													<option value={point.stationId} key={`${point.stationId}-${index}`}>
														{station?.name ?? point.stationId}
													</option>
												);
											})}
										</select>
									</label>
									<label>
										<span>終着駅</span>
										<select
											value={selectedTrain.destinationStationId}
											onChange={(event) =>
												updateTrain(selectedTrain.id, (train) => ({
													...(() => {
														const destinationIndex = train.route.findIndex(
															(point) => point.stationId === event.target.value,
														);
														const route = destinationIndex < 0 ? train.route : train.route.slice(0, destinationIndex + 1);
														return {
															originStationId: route[0]?.stationId ?? train.originStationId,
															destinationStationId: route.at(-1)?.stationId ?? train.destinationStationId,
															route: route.map((point, index) =>
																index === route.length - 1 ?
																	{ ...point, departureTime: null, isPassing: false }
																:	point,
															),
															serviceRouteId: undefined,
														};
													})(),
												}))
											}
										>
											{selectedTrain.route.map((point, index) => {
												const station = stations.find((item) => item.id === point.stationId);
												return (
													<option value={point.stationId} key={`${point.stationId}-${index}`}>
														{station?.name ?? point.stationId}
													</option>
												);
											})}
										</select>
									</label>
									<label className='manage-checkbox'>
										<input
											type='checkbox'
											checked={selectedTrain.isDepotOut}
											onChange={(event) =>
												updateTrain(selectedTrain.id, (train) => ({ ...train, isDepotOut: event.target.checked }))
											}
										/>
										<span>出庫</span>
									</label>
									<label className='manage-checkbox'>
										<input
											type='checkbox'
											checked={selectedTrain.isDepotIn}
											onChange={(event) =>
												updateTrain(selectedTrain.id, (train) => ({ ...train, isDepotIn: event.target.checked }))
											}
										/>
										<span>入庫</span>
									</label>
								</div>
								<div className='train-route-toolbar'>
									<strong>経由駅・着発時刻</strong>
									<select
										aria-label='列車に経由駅を追加'
										value=''
										disabled={stations.every((station) => selectedTrain.route.some((point) => point.stationId === station.id))}
										onChange={(event) => addTrainRouteStation(selectedTrain.id, event.target.value)}
									>
										<option value=''>＋ 経由駅を追加</option>
										{stations
											.filter((station) => !selectedTrain.route.some((point) => point.stationId === station.id))
											.map((station) => (
												<option value={station.id} key={station.id}>
													{station.name}
												</option>
											))}
									</select>
								</div>
								<div className='route-editor-list'>
									{selectedTrain.route.map((point, index) => {
										const station = railway.stations.find((item) => item.id === point.stationId);
										return (
											<div className='route-editor-row' key={`${point.stationId}-${index}`}>
												<div className='route-station'>
													<span className='route-stop-dot' />
													<span>
														{station?.name ?? point.stationId}
														{point.isPassing ?
															<small>通過</small>
														:	null}
													</span>
												</div>
												{point.isPassing ?
													<div className='route-editor-time'>
														<DigitTimeInput
															key={`passing-${index}-${point.arrivalTime ?? ''}`}
															aria-label={`${station?.name ?? point.stationId} 通過時刻`}
															label='通過'
															value={point.arrivalTime ?? point.departureTime}
															onChange={(value) => updateRouteTime(selectedTrain.id, index, 'arrivalTime', value)}
														/>
													</div>
												:	<>
														<div className='route-editor-time'>
															<DigitTimeInput
																key={`arrival-${index}-${point.arrivalTime ?? ''}`}
																aria-label={`${station?.name ?? point.stationId} 着時刻`}
																label='着'
																value={point.arrivalTime}
																onChange={(value) => updateRouteTime(selectedTrain.id, index, 'arrivalTime', value)}
															/>
														</div>
														<div className='route-editor-time'>
															<DigitTimeInput
																key={`departure-${index}-${point.departureTime ?? ''}`}
																aria-label={`${station?.name ?? point.stationId} 発時刻`}
																label='発'
																value={point.departureTime}
																onChange={(value) => updateRouteTime(selectedTrain.id, index, 'departureTime', value)}
															/>
														</div>
													</>
												}
												<div className='route-point-actions'>
													{index > 0 && index < selectedTrain.route.length - 1 && (
														<button
															type='button'
															aria-label={`${station?.name ?? point.stationId}の順序を上げる`}
															disabled={index <= 1}
															onClick={() => moveTrainRouteStation(selectedTrain.id, index, -1)}
														>
															↑
														</button>
													)}
													{index > 0 && index < selectedTrain.route.length - 1 && (
														<button
															type='button'
															aria-label={`${station?.name ?? point.stationId}の順序を下げる`}
															disabled={index >= selectedTrain.route.length - 2}
															onClick={() => moveTrainRouteStation(selectedTrain.id, index, 1)}
														>
															↓
														</button>
													)}
													{index > 0 && index < selectedTrain.route.length - 1 && (
														<button
															type='button'
															aria-pressed={Boolean(point.isPassing)}
															onClick={() => togglePassing(selectedTrain.id, index)}
														>
															{point.isPassing ? '停車' : '通過'}
														</button>
													)}
													{index > 0 && index < selectedTrain.route.length - 1 && (
														<button
															type='button'
															aria-label={`${station?.name ?? point.stationId}を経由駅から削除`}
															onClick={() => removeTrainRouteStation(selectedTrain.id, index)}
														>
															×
														</button>
													)}
												</div>
												<details className='route-point-details'>
													<summary>番線・併結</summary>
													<div>
														<label>
															<span>番線</span>
															<input
																aria-label={`${station?.name ?? point.stationId}の番線`}
																value={point.trackNumber}
																onChange={(event) =>
																	updateRoutePoint(selectedTrain.id, index, (current) => ({
																		...current,
																		trackNumber: event.target.value,
																	}))
																}
															/>
														</label>
														<label>
															<span>イベント</span>
															<select
																aria-label={`${station?.name ?? point.stationId}の併結・解放イベント`}
																value={point.operationEvent?.type ?? ''}
																onChange={(event) => updateRouteEvent(selectedTrain.id, index, event.target.value)}
															>
																<option value=''>なし</option>
																<option value='combine'>併結</option>
																<option value='split'>解放</option>
															</select>
														</label>
														{point.operationEvent && (
															<>
																<label>
																	<span>運用</span>
																	<select
																		aria-label={`${station?.name ?? point.stationId}の対象運用`}
																		value={point.operationEvent.operationId}
																		onChange={(event) =>
																			updateRoutePoint(selectedTrain.id, index, (current) => ({
																				...current,
																				operationEvent: {
																					...current.operationEvent,
																					operationId: event.target.value,
																				},
																			}))
																		}
																	>
																		{operations.map((operation) => (
																			<option value={operation.id} key={operation.id}>
																				{operation.id}
																			</option>
																		))}
																	</select>
																</label>
																{point.operationEvent.type === 'split' && (
																	<label>
																		<span>移動先列車</span>
																		<select
																			aria-label={`${station?.name ?? point.stationId}の移動先列車`}
																			value={point.operationEvent.targetTrainId ?? ''}
																			onChange={(event) =>
																				updateRoutePoint(selectedTrain.id, index, (current) => ({
																					...current,
																					operationEvent: {
																						...current.operationEvent,
																						targetTrainId: event.target.value || null,
																					},
																				}))
																			}
																		>
																			<option value=''>指定なし</option>
																			{railway.trains
																				.filter((train) => train.id !== selectedTrain.id)
																				.map((train) => (
																					<option value={train.id} key={train.id}>
																						{train.trainNumber}
																					</option>
																				))}
																		</select>
																	</label>
																)}
															</>
														)}
													</div>
												</details>
											</div>
										);
									})}
								</div>
							</section>
						:	<div className='empty-state'>列車がありません。「列車を追加」から作成できます。</div>}
					</>
				)}

				{activeTab === 'manage' && railway && (
					<section className='detail-card railway-manage'>
						<section aria-labelledby='railway-details-title'>
							<div className='manage-section-heading'>
								<div>
									<p className='eyebrow'>RAILWAY</p>
									<h2 id='railway-details-title'>ダイヤ情報</h2>
								</div>
							</div>
							<label className='railway-name-field'>
								<span>鉄道・ダイヤ名</span>
								<input
									value={railway.railwayName}
									onChange={(event) => setRailway((current) => ({ ...current, railwayName: event.target.value }))}
								/>
							</label>
						</section>

						<section aria-labelledby='service-route-list-title'>
							<div className='manage-section-heading'>
								<div>
									<p className='eyebrow'>OPERATING SYSTEMS</p>
									<h2 id='service-route-list-title'>運行系統</h2>
								</div>
								<button className='manage-add-button' type='button' onClick={addServiceRoute} disabled={stations.length < 2}>
									＋ 系統を追加
								</button>
							</div>
							<p className='manage-help'>運行系統ごとに、列車が通る駅の順序を設定します。</p>
							<div className='service-route-list'>
								{serviceRoutes.map((route) => (
									<article className='service-route-card' key={route.id}>
										<div className='service-route-heading'>
											<input
												aria-label={`${route.name} 系統名`}
												value={route.name}
												onChange={(event) =>
													updateServiceRoute(route.id, (current) => ({ ...current, name: event.target.value }))
												}
											/>
											<button type='button' className='manage-remove-button' onClick={() => removeServiceRoute(route.id)}>
												系統を削除
											</button>
										</div>
										<ol className='service-route-stations'>
											{route.stationIds.map((stationId, index) => {
												const previousStationId = route.stationIds[index - 1];
												const nextStationId = route.stationIds[index + 1];
												const allowedIds = stations
													.map((station) => station.id)
													.filter((id) => id === stationId || (id !== previousStationId && id !== nextStationId));
												return (
													<li key={`${route.id}-${index}`}>
														<span className='service-route-index'>{index + 1}</span>
														<select
															aria-label={`${route.name} 経由駅 ${index + 1}`}
															value={stationId}
															onChange={(event) =>
																updateServiceRoute(route.id, (current) => ({
																	...current,
																	stationIds: current.stationIds.map((id, routeIndex) =>
																		routeIndex === index ? event.target.value : id,
																	),
																}))
															}
														>
															{allowedIds.map((id) => {
																const station = railway.stations.find((item) => item.id === id);
																return station ?
																		<option value={station.id} key={station.id}>
																			{station.name}
																		</option>
																	:	null;
															})}
														</select>
														<button
															type='button'
															className='manage-remove-button'
															aria-label={`${route.name} 経由駅 ${index + 1}を削除`}
															disabled={route.stationIds.length <= 2}
															onClick={() =>
																updateServiceRoute(route.id, (current) => ({
																	...current,
																	stationIds: current.stationIds.filter((_, routeIndex) => routeIndex !== index),
																}))
															}
														>
															−
														</button>
													</li>
												);
											})}
										</ol>
										<div className='service-route-footer'>
											<span>{railway.trains.filter((train) => train.serviceRouteId === route.id).length} 列車で使用</span>
											<select
												className='service-route-add-stop'
												aria-label={`${route.name}に経由駅を追加`}
												value=''
												disabled={stations.every((station) => route.stationIds.includes(station.id))}
												onChange={(event) => {
													const nextStationId = event.target.value;
													if (nextStationId)
														updateServiceRoute(route.id, (current) => ({
															...current,
															stationIds: [...current.stationIds, nextStationId],
														}));
												}}
											>
												<option value=''>＋ 経由駅を選択</option>
												{stations
													.filter((station) => !route.stationIds.includes(station.id))
													.map((station) => (
														<option value={station.id} key={station.id}>
															{station.name}
														</option>
													))}
											</select>
										</div>
									</article>
								))}
								{!serviceRoutes.length && (
									<p className='manage-empty'>運行系統がありません。「系統を追加」から作成できます。</p>
								)}
							</div>
						</section>

						<section aria-labelledby='station-list-title'>
							<div className='manage-section-heading'>
								<div>
									<p className='eyebrow'>STATIONS</p>
									<h2 id='station-list-title'>駅一覧</h2>
								</div>
							</div>
							<form
								className='quick-station-form'
								onSubmit={(event) => {
									event.preventDefault();
									addStation();
								}}
							>
								<input
									ref={newStationInput}
									aria-label='追加する駅名'
									autoComplete='off'
									placeholder='駅名を入力'
									value={newStationName}
									onChange={(event) => setNewStationName(event.target.value)}
								/>
								<button className='manage-add-button' type='submit' disabled={!newStationName.trim()}>
									＋ 駅を追加
								</button>
							</form>
							<div className='manage-station-list'>
								{railway.stations.map((station) => {
									const isUsed =
										railway.trains.some((train) => train.route.some((point) => point.stationId === station.id)) ||
										serviceRoutes.some((route) => route.stationIds.includes(station.id));
									return (
										<div className='manage-station-row' key={station.id}>
											<label>
												<span>駅名</span>
												<input
													value={station.name}
													onChange={(event) =>
														setRailway((current) => ({
															...current,
															stations: current.stations.map((item) =>
																item.id === station.id ? { ...item, name: event.target.value } : item,
															),
														}))
													}
												/>
											</label>
											<label>
												<span>キロ程</span>
												<input
													type='number'
													step='0.1'
													value={station.kilopost}
													onChange={(event) =>
														setRailway((current) => ({
															...current,
															stations: current.stations.map((item) =>
																item.id === station.id ? { ...item, kilopost: Number(event.target.value) } : item,
															),
														}))
													}
												/>
											</label>
											<label className='manage-checkbox'>
												<input
													type='checkbox'
													checked={station.hasTracks}
													onChange={(event) =>
														setRailway((current) => ({
															...current,
															stations: current.stations.map((item) =>
																item.id === station.id ? { ...item, hasTracks: event.target.checked } : item,
															),
														}))
													}
												/>
												待避線
											</label>
											<button
												type='button'
												className='manage-remove-button'
												disabled={isUsed}
												title={isUsed ? '列車または運行系統で使用中の駅は削除できません' : '駅を削除'}
												onClick={() => removeStation(station.id)}
											>
												削除
											</button>
										</div>
									);
								})}
							</div>
							<p className='manage-help'>列車または運行系統で使用中の駅は削除できません。先に経路を変更してください。</p>
						</section>

						<section aria-labelledby='train-type-list-title'>
							<div className='manage-section-heading'>
								<div>
									<p className='eyebrow'>TRAIN CATEGORIES</p>
									<h2 id='train-type-list-title'>種別一覧</h2>
								</div>
								<button className='manage-add-button' type='button' onClick={addTrainType}>
									＋ 種別を追加
								</button>
							</div>
							<div className='manage-type-list'>
								{trainTypes.map((typeName, index) => (
									<div className='manage-type-row' key={index}>
										<input
											aria-label={`${typeName}種別名`}
											value={typeName}
											onChange={(event) => {
												const nextName = event.target.value;
												if (
													nextName &&
													trainTypes.some((existingName) => existingName !== typeName && existingName === nextName)
												)
													return;
												updateTrainType(typeName, nextName);
											}}
											onBlur={() => {
												if (typeName.trim()) return;
												const base = '新しい種別';
												let replacement = base;
												let suffix = 2;
												while (trainTypes.includes(replacement)) {
													replacement = `${base} ${suffix}`;
													suffix += 1;
												}
												updateTrainType(typeName, replacement);
											}}
										/>
										<label className='manage-type-color'>
											<span>ダイヤグラム線色</span>
											<input
												type='color'
												aria-label={`${typeName}のダイヤグラム線色`}
												value={getTrainTypeColor(typeName)}
												onChange={(event) => updateTrainTypeColor(typeName, event.target.value)}
											/>
										</label>
										<label className='manage-type-color'>
											<span>時刻表文字色</span>
											<input
												type='color'
												aria-label={`${typeName}の時刻表文字色`}
												value={getTrainTypeTextColor(typeName)}
												onChange={(event) => updateTrainTypeColor(typeName, event.target.value, true)}
											/>
										</label>
										<button
											type='button'
											className='manage-remove-button'
											onClick={() => removeTrainType(typeName)}
											disabled={trainTypes.length < 2}
										>
											削除
										</button>
									</div>
								))}
							</div>
							<p className='manage-help'>種別名を変更すると、その種別を使用中の列車にも反映されます。</p>
						</section>
					</section>
				)}

				{activeTab === 'timetable' && railway && (
					<section className='timetable-card' aria-label='時刻表'>
						<div className='timetable-toolbar'>
							<label>
								<span>系統</span>
								<select
									aria-label='全体時刻表の運行系統'
									value={activeTimetableServiceRouteId}
									onChange={(event) => setTimetableServiceRouteId(event.target.value)}
								>
									<option value='all'>すべて</option>
									{serviceRoutes.map((route) => (
										<option value={route.id} key={route.id}>
											{route.name}
										</option>
									))}
								</select>
							</label>
							<label>
								<span>方向</span>
								<select
									aria-label='全体時刻表の方向'
									value={timetableDirection}
									onChange={(event) => setTimetableDirection(event.target.value)}
								>
									<option value='all'>上下すべて</option>
									<option value='down'>下り</option>
									<option value='up'>上り</option>
								</select>
							</label>
							<label>
								<span>種別</span>
								<select value={timetableTypeFilter} onChange={(event) => setTimetableTypeFilter(event.target.value)}>
									<option value='all'>すべて</option>
									{[...new Set(railway.trains.map(getTrainTypeName))].map((typeName) => (
										<option value={typeName} key={typeName}>
											{typeName}
										</option>
									))}
								</select>
							</label>
							<label>
								<span>並び順</span>
								<select value={timetableSort} onChange={(event) => setTimetableSort(event.target.value)}>
									<option value='time'>発車時刻</option>
									<option value='number'>列車番号</option>
									<option value='type'>種別</option>
								</select>
							</label>
							<button
								type='button'
								className={showTrainNames ? 'is-active' : ''}
								aria-pressed={showTrainNames}
								onClick={() => setShowTrainNames((visible) => !visible)}
							>
								列車名
							</button>
							<button
								type='button'
								className={showSeconds ? 'is-active' : ''}
								aria-pressed={showSeconds}
								onClick={() => setShowSeconds((visible) => !visible)}
							>
								秒
							</button>
							<span className='timetable-result-count'>{timetableTrains.length}本</span>
						</div>
						<div className='timetable-scroll'>
							<table className='paper-timetable'>
								<thead>
									<tr>
										<th scope='col' className='timetable-station-heading'>
											駅名
										</th>
										{timetableTrains.map((train) => (
											<th scope='col' key={train.id}>
												<button
													type='button'
													style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}
													onClick={() => {
														setSelectedTrainId(train.id);
														navigateView('train');
													}}
												>
													<span style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}>{train.trainNumber}</span>
													<small style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}>
														{getTrainTypeName(train)}
													</small>
													{showTrainNames && train.trainName && (
														<small
															className='timetable-train-name'
															style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}
														>
															{train.trainName}
														</small>
													)}
												</button>
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{timetableStations.map((station) => (
										<tr className={station.isCircularBoundary ? 'circular-boundary' : ''} key={station.displayKey}>
											<th scope='row' className='timetable-station'>
												{station.name}
											</th>
											{timetableTrains.map((train) => {
												const point =
													station.isCircularBoundary ?
														train.route.at(-1)?.stationId === station.id ?
															train.route.at(-1)
														:	undefined
													:	train.route.find((routePoint) => routePoint.stationId === station.id);
												return (
													<td key={`${train.id}-${station.displayKey}`}>
														{point && (
															<button
																type='button'
																className='timetable-times'
																style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}
																aria-label={`${train.trainNumber} ${station.name}の時刻を編集`}
																onClick={() => {
																	setSelectedTrainId(train.id);
																	setSelectedStop({
																		trainId: train.id,
																		routeIndex: train.route.indexOf(point),
																	});
																	navigateView('train');
																}}
															>
																{point.isPassing ?
																	<span
																		className='timetable-pass'
																		aria-label='通過'
																		style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}
																	>
																		レ
																	</span>
																:	<span
																		className='timetable-time-value'
																		style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}
																	>
																		{formatTimetableTime(point.departureTime ?? point.arrivalTime, showSeconds)}
																	</span>
																}
															</button>
														)}
													</td>
												);
											})}
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</section>
				)}

				{activeTab === 'station' && railway && (
					<section className='station-timetable-card' aria-label='駅時刻表'>
						<header className='station-timetable-heading'>
							<div>
								<p className='eyebrow'>STATION TIMETABLE / {stationTimetableTrains.length} TRAINS</p>
								<h2>{selectedStation?.name ?? '駅を選択'}</h2>
							</div>
							<label className='station-picker'>
								<span>駅</span>
								<select
									aria-label='駅を選択'
									value={selectedStation?.id ?? ''}
									onChange={(event) => {
										selectedStationIdRef.current = event.target.value;
										setSelectedStationId(event.target.value);
									}}
								>
									{stations.map((station) => (
										<option value={station.id} key={station.id}>
											{station.name}
										</option>
									))}
								</select>
							</label>
						</header>
						<div className='station-direction-tabs' role='group' aria-label='運転方向'>
							{[
								['all', '全方向'],
								['down', '下り'],
								['up', '上り'],
							].map(([direction, label]) => (
								<button
									type='button'
									key={direction}
									className={stationDirection === direction ? 'is-active' : ''}
									aria-pressed={stationDirection === direction}
									onClick={() => setStationDirection(direction)}
								>
									{label}
								</button>
							))}
						</div>
						<div className='station-timetable-list'>
							{stationTimetableTrains.map(({ train, point }) => {
								const routeIndex = train.route.findIndex((routePoint) => routePoint.stationId === selectedStation.id);
								return (
									<button
										className='station-timetable-row'
										type='button'
										key={train.id}
										onClick={() => {
											setSelectedTrainId(train.id);
											setSelectedStop({ trainId: train.id, routeIndex });
											navigateView('train');
										}}
									>
										<span className='station-timetable-time'>
											<span style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}>
												{point.isPassing ?
													`通過 ${point.arrivalTime?.slice(0, showSeconds ? 8 : 5) ?? '—'}`
												:	(point.departureTime?.slice(0, showSeconds ? 8 : 5) ??
													point.arrivalTime?.slice(0, showSeconds ? 8 : 5) ??
													'—')
												}
											</span>
										</span>
										<span className='station-timetable-train'>
											<strong style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}>{train.trainNumber}</strong>
											<small style={{ color: getTrainTypeTextColor(getTrainTypeName(train)) }}>
												{getTrainTypeName(train)}
												{showTrainNames && train.trainName ? ` · ${train.trainName}` : ''}
											</small>
										</span>
										<span className='station-timetable-destination'>
											{stations.find((station) => station.id === train.destinationStationId)?.name ??
												train.destinationStationId}{' '}
											行
										</span>
										<span className='station-timetable-chevron' aria-hidden='true'>
											›
										</span>
									</button>
								);
							})}
							{stationTimetableTrains.length === 0 && <div className='empty-state'>この駅を通る列車はありません。</div>}
						</div>
					</section>
				)}

				{activeTab === 'operation' && (
					<section className='operation-screen' aria-label='車両運用'>
						<div className='operation-toolbar'>
							<button className='operation-generate-button' type='button' onClick={generateOperations}>
								⇄ 運用を自動生成
							</button>
							<button className='manage-add-button' type='button' onClick={addOperation}>
								＋ 運用を追加
							</button>
						</div>
						{selectedOperation ?
							<>
								<div className='operation-swipe-hint'>スワイプまたは矢印で運用を切り替え</div>
								<article
									className='operation-card'
									onTouchStart={(event) => {
										dragState.current = { touchX: event.touches[0].clientX };
									}}
									onTouchEnd={(event) => {
										if (!dragState.current?.touchX) return;
										const delta = event.changedTouches[0].clientX - dragState.current.touchX;
										if (Math.abs(delta) > 40) moveOperation(delta < 0 ? 1 : -1);
										dragState.current = null;
									}}
								>
									<div className='operation-card-top'>
										<span className='operation-badge'>仕業</span>
										<span>
											{selectedOperationIndex + 1} / {operations.length}
										</span>
									</div>
									<label className='operation-field'>
										<span>運用番号</span>
										<input
											value={selectedOperation.id}
											onChange={(event) =>
												updateOperation(selectedOperation.id, (operation) => ({
													...operation,
													id: event.target.value,
												}))
											}
										/>
									</label>
									<button
										className='manage-remove-button operation-delete-button'
										type='button'
										onClick={() => removeOperation(selectedOperation.id)}
									>
										運用を削除
									</button>
									<label className='operation-car-count-editor'>
										<span>両数</span>
										<input
											type='number'
											min='1'
											step='1'
											value={selectedOperation.carCount}
											onChange={(event) =>
												updateOperation(selectedOperation.id, (operation) => ({
													...operation,
													carCount: Math.max(1, Math.floor(Number(event.target.value) || 1)),
												}))
											}
										/>
										<span>両編成</span>
									</label>
									<h3 className='operation-members-title'>担当列車</h3>
									<div className='operation-member-picker'>
										{railway.trains.map((train) => (
											<label key={train.id}>
												<input
													type='checkbox'
													checked={selectedOperation.trainIds.includes(train.id)}
													onChange={(event) => toggleTrainInOperation(selectedOperation.id, train.id, event.target.checked)}
												/>
												<span>
													{train.trainNumber} · {getTrainTypeName(train)}
												</span>
											</label>
										))}
										{!railway.trains.length && <span className='manage-empty'>先に列車を追加してください。</span>}
									</div>
									<div className='operation-trains'>
										{selectedOperation.trainIds.map((trainId, index) => {
											const train = railway.trains.find((item) => item.id === trainId);
											const origin = railway.stations.find((station) => station.id === train?.originStationId);
											const destination = railway.stations.find((station) => station.id === train?.destinationStationId);
											return (
												<div className='operation-train-row' key={trainId}>
													<span className='operation-step'>{String(index + 1).padStart(2, '0')}</span>
													<span className='operation-route-line' />
													<div>
														<strong>{train?.trainNumber ?? trainId}</strong>
														<span>
															{origin?.name ?? train?.originStationId} →{' '}
															{destination?.name ?? train?.destinationStationId}
														</span>
													</div>
													<span className='operation-train-time'>{train?.route[0]?.departureTime?.slice(0, 5) ?? '—'}</span>
												</div>
											);
										})}
									</div>
								</article>
								<div className='operation-controls'>
									<button type='button' onClick={() => moveOperation(-1)} aria-label='前の運用'>
										←
									</button>
									<div className='operation-dots'>
										{operations.map((operation, index) => (
											<button
												key={operation.id}
												type='button'
												aria-label={`${operation.id}を表示`}
												className={index === selectedOperationIndex ? 'is-active' : ''}
												onClick={() => setSelectedOperationIndex(index)}
											/>
										))}
									</div>
									<button type='button' onClick={() => moveOperation(1)} aria-label='次の運用'>
										→
									</button>
								</div>
							</>
						:	<div className='empty-state'>運用データがありません。.oud2を読み込んでください。</div>}
					</section>
				)}
			</section>

			{pendingImport && (
				<div
					className='import-choice-backdrop'
					onMouseDown={(event) => {
						if (event.target === event.currentTarget) cancelImport();
					}}
				>
					<section
						className='import-choice-dialog'
						role='dialog'
						aria-modal='true'
						aria-labelledby='import-choice-title'
						aria-describedby='import-choice-description'
					>
						<p className='eyebrow'>OUDIA IMPORT</p>
						<h2 id='import-choice-title'>読込方法を選択</h2>
						<p id='import-choice-description'>
							「{pendingImport.sourceName}」を現在のダイヤ「{railway?.railwayName}」へどのように読み込みますか？
						</p>
						<div className='import-choice-actions'>
							<button
								type='button'
								className='import-choice-button is-merge'
								onClick={() => applyImportedRailway(pendingImport.railway, pendingImport.sourceName, pendingImport.showDiagram, true)}
							>
								<strong>結合して読み込む</strong>
								<span>既存の駅・列車を残し、読み込んだ系統と列車を追加します。</span>
							</button>
							<button
								type='button'
								className='import-choice-button is-overwrite'
								onClick={() =>
									applyImportedRailway(pendingImport.railway, pendingImport.sourceName, pendingImport.showDiagram, false)
								}
							>
								<strong>上書きして読み込む</strong>
								<span>現在のダイヤ全体を置き換えます。</span>
							</button>
						</div>
						<button type='button' className='import-choice-cancel' onClick={cancelImport}>
							キャンセル
						</button>
					</section>
				</div>
			)}

			<nav className='bottom-navigation' aria-label='メインナビゲーション'>
				{[
					['diagram', '⌁', 'ダイヤ'],
					['timetable', '表', '時刻表'],
					['station', '駅', '駅時刻'],
					['train', '▤', '列車'],
					['operation', '⇄', '運用'],
					['manage', '駅', '駅・種別'],
				].map(([tab, icon, label]) => (
					<button
						className={activeTab === tab ? 'is-active' : ''}
						key={tab}
						type='button'
						aria-current={activeTab === tab ? 'page' : undefined}
						onClick={() => navigateView(tab)}
					>
						<span aria-hidden='true'>{icon}</span>
						{label}
					</button>
				))}
			</nav>
		</main>
	);
}

function DigitTimeInput({ label, value, onChange, ...inputProps }) {
	const [draft, setDraft] = useState(value?.replaceAll(':', '') ?? '');
	const [error, setError] = useState('');

	const handleChange = (event) => {
		const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
		setDraft(digits);
		setError('');
		if (digits.length !== 6) return;

		try {
			onChange(digitsToTime(digits));
		} catch (inputError) {
			setError(inputError.message);
		}
	};

	return (
		<label className='digit-time-field'>
			<span>{label}</span>
			<input
				{...inputProps}
				type='text'
				inputMode='numeric'
				pattern='[0-9]*'
				maxLength={6}
				placeholder='101015'
				value={draft}
				aria-invalid={Boolean(error)}
				onChange={handleChange}
				onBlur={() => {
					if (!draft) {
						onChange(null);
						setError('');
					} else if (draft.length !== 6) {
						setError('時刻は6桁で入力してください');
					}
				}}
				onFocus={(event) => event.currentTarget.select()}
			/>
			{error && (
				<span className='digit-time-error' role='alert'>
					{error}
				</span>
			)}
		</label>
	);
}
