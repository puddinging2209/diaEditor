import { atom } from 'jotai'
import { sidebarTop } from '../../../data/pages'

export const pageIdAtom = atom(sidebarTop[0].id)
