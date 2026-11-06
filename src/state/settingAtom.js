import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'
import { atomWithStorage } from 'jotai/utils'
import { getNameSpaceKey } from '../lib/namespaceKey'

const settingStorageAtom = atomWithStorage(
	getNameSpaceKey('settings'),
	{},
	undefined,
	{ getOnInit: true }
)

export const settingAtom = atomFamily(key => {
	return atom(
		get => get(settingStorageAtom)[key],
		(get, set, value) => {
			set(settingStorageAtom, {
				...get(settingStorageAtom),
				[key]: value
			})
		}
	)
})
