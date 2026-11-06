import { pages } from '../../data/pages'
import { pageIdAtom } from './states/page'

export const appFeature = {
	id: 'app',
	initialize: (get, set) => {

	},
	commands: [
		{
			id: 'page',
			name: 'ページを開く',
			type: 'complement',
		},
		...Object.values(pages).map(p => {
			return {
				id: ['page', p.id].join('.'),
				icon: p.icon,
				name: `${p.name} を開く`,
				type: 'run',
				run: (get, set) => {
					set(pageIdAtom, p.id)
				}
			}
		})
	]
}
