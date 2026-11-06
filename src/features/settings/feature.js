import { settingItems } from '../../data/settings'
import { settingAtom } from '../../state/settingAtom'

export const settingsFeature = {
	id: 'settings',
	initialize: (get, set) => {
		Object.values(settingItems)
			.filter(p => !get(settingAtom(p.id)) && Object.hasOwn(p, 'defaultValue'))
			.forEach(p => {
				set(settingAtom(p.id), p.defaultValue)
			})
	},
	commands: [
		{
			id: 'setting',
			name: '設定を変更',
			type: 'complement',
		},
		...Object.values(settingItems).flatMap(p => {
			const c = {
				id: ['setting', p.id].join('.'),
				name: `${p.name} の設定`,
				type: 'complement'
			}
			switch (p.type) {
				case 'select':
					return [c, ...Object.entries(p.options).map(([k, v]) => {
						return {
							id: ['setting', p.id, k].join('.'),
							name: `${p.name} を ${v} に設定する`,
							type: 'run',
							run: (get, set) => set(settingAtom(p.id), k)
						}
					})]
				case 'checkbox':
					return [c,
						{
							id: ['setting', p.id, 'on'].join('.'),
							name: `${p.name} を オン に設定する`,
							type: 'run',
							run: (get, set) => set(settingAtom(p.id), true)
						}, {
							id: ['setting', p.id, 'off'].join('.'),
							name: `${p.name} を オフ に設定する`,
							type: 'run',
							run: (get, set) => set(settingAtom(p.id), false)
						}]
				default:
					return []
			}
		})
	]
}
