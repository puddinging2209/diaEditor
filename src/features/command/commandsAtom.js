import { atom } from 'jotai'

export const commandsAtom = atom([])

export const registerCommandAtom = atom(
	null,
	(get, set, command) => {
		set(commandsAtom, [...get(commandsAtom), ...command])

		return () => {
			const ids = command.map(c => c.id)
			set(
				commandsAtom,
				get(commandsAtom).filter(c => !ids.includes(c.id))
			)
		}
	}
)
