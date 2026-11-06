import { atom } from 'jotai'

export const railwayViewAtom = atom('diagram')
export const railwayPreviousViewAtom = atom('diagram')
export const railwayImportRequestAtom = atom(0)

export const navigateRailwayViewAtom = atom(null, (get, set, nextView) => {
	const currentView = get(railwayViewAtom)
	if (currentView !== nextView) {
		set(railwayPreviousViewAtom, currentView)
		set(railwayViewAtom, nextView)
	}
})

export const returnToPreviousRailwayViewAtom = atom(null, (get, set) => {
	const currentView = get(railwayViewAtom)
	const previousView = get(railwayPreviousViewAtom)
	set(railwayViewAtom, previousView === 'train' ? 'diagram' : previousView)
	set(railwayPreviousViewAtom, currentView)
})
