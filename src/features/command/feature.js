import { features } from '../../data/features'
import { registerCommandAtom } from './commandsAtom'

export const commandFeature = {
	id: 'command',
	initialize: (get, set) => {
		const commands = Object.values(features).flatMap(f => f.commands)
		set(registerCommandAtom, commands)
	},
	commands: []
}
