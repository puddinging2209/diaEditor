import { atom } from 'jotai'
import { settingPages } from '../../../data/settings'

export const pageIdAtom = atom(settingPages[0].id)
