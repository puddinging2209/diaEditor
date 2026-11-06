import { Flex, VStack } from '@chakra-ui/react'
import { IconButton, Text } from '@chakra-ui/react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { HiOutlineArrowsRightLeft, HiOutlineChartBar, HiOutlineClock, HiOutlineTableCells, HiOutlineMap } from 'react-icons/hi2'
import { sidebarBottom, sidebarTop } from '../../../data/pages'
import { navigateRailwayViewAtom, railwayViewAtom } from '../../main/states/railwayView'
import { SidebarItem } from './SidebarItem'
import { isSidebarOpenAtom } from '../states/sidebar'
import { pageIdAtom } from '../states/page'

export const Sidebar = () => {
	const view = useAtomValue(railwayViewAtom)
	const navigateView = useSetAtom(navigateRailwayViewAtom)
	const [pageId, setPageId] = useAtom(pageIdAtom)
	const setIsSidebarOpen = useSetAtom(isSidebarOpenAtom)
	const isSidebarOpen = useAtomValue(isSidebarOpenAtom)
	const views = [
		{ id: 'diagram', label: 'ダイヤグラム', icon: HiOutlineChartBar },
		{ id: 'timetable', label: '時刻表', icon: HiOutlineTableCells },
		{ id: 'train', label: '列車時刻', icon: HiOutlineClock },
		{ id: 'operation', label: '車両運用', icon: HiOutlineArrowsRightLeft },
		{ id: 'manage', label: '駅・種別管理', icon: HiOutlineMap },
	]

	return (
		<Flex
			direction='column'
			justifyContent='flex-start'
			alignContent='center'
			width='full'
			height='full'
			paddingInline='0.375rem'
		>
			<VStack gap={0} width='full'>
				{
					sidebarTop.map((e, i) => <SidebarItem itemData={e} key={i}></SidebarItem>)
				}
			</VStack>
			{pageId === 'main' && (
				<VStack gap={0} width='full' paddingTop='0.5rem'>
					{isSidebarOpen && <Text paddingInline='0.75rem' paddingBottom='0.25rem' color='fg.muted' fontSize='xs'>ダイヤ編集</Text>}
					{views.map(({ id, label, icon: Icon }) => (
						<IconButton
							key={id}
							aria-label={label}
							title={label}
							padding={0}
							border={0}
							variant='subtle'
							background={view === id ? 'bg.emphasized' : null}
							color={view === id ? 'fg' : { base: 'fg.muted', _hover: 'fg' }}
							size='sm'
							width='full'
							height='3rem'
							onClick={() => {
								setPageId('main')
								navigateView(id)
								setIsSidebarOpen(false)
							}}
						>
							<span className='sidebar-railway-item'>
								<Icon size='24px' />
								{isSidebarOpen && <span>{label}</span>}
							</span>
						</IconButton>
					))}
				</VStack>
			)}
			<VStack gap={0} width='full' marginTop='auto'>
				{
					sidebarBottom.map((e, i) => <SidebarItem itemData={e} key={i}></SidebarItem>)
				}
			</VStack>
		</Flex>
	)
}
