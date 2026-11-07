import { navigateRailwayViewAtom, railwayImportRequestAtom } from './states/railwayView'
import { pageIdAtom } from '../app/states/page'
import { isSidebarOpenAtom } from '../app/states/sidebar'

const viewCommands = [
  { id: 'diagram', name: 'ダイヤグラムを表示', view: 'diagram' },
  { id: 'timetable', name: '時刻表を表示', view: 'timetable' },
  { id: 'station', name: '駅時刻表を表示', view: 'station' },
  { id: 'train', name: '列車時刻を編集', view: 'train' },
  { id: 'operation', name: '車両運用を表示', view: 'operation' },
  { id: 'manage', name: '駅・種別を管理', view: 'manage' },
]

export const mainFeature = {
  id: 'main',
  initialize: () => undefined,
  commands: [
    {
      id: 'railway',
      name: 'ダイヤ・運用',
      type: 'complement',
    },
    ...viewCommands.map(({ id, name, view }) => ({
      id: `railway.${id}`,
      name,
      type: 'run',
      run: (get, set) => {
        set(pageIdAtom, 'main')
        set(navigateRailwayViewAtom, view)
        if (window.matchMedia('(max-width: 700px)').matches) set(isSidebarOpenAtom, false)
      },
    })),
    {
      id: 'railway.import',
      name: '.oud2ファイルを読み込む',
      type: 'run',
      run: (get, set) => {
        set(pageIdAtom, 'main')
        set(railwayImportRequestAtom, get(railwayImportRequestAtom) + 1)
        if (window.matchMedia('(max-width: 700px)').matches) set(isSidebarOpenAtom, false)
      },
    },
  ],
}
