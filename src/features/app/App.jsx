import { Box, Grid } from '@chakra-ui/react'
import { useAtomValue, useStore } from 'jotai'
import { useEffect } from 'react'
import { features } from '../../data/features'
import { pages } from '../../data/pages'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { Version } from './components/Version'
import { ConfigProvider } from './providers/ConfigProvider'
import { pageIdAtom } from './states/page'
import { isSidebarOpenAtom } from './states/sidebar'

export const App = () => {
	const isSidebarOpen = useAtomValue(isSidebarOpenAtom)
	const pageId = useAtomValue(pageIdAtom)
	const pageData = pages[pageId]
	const sidebarSize = isSidebarOpen ? '300px' : '3rem'
	const store = useStore()
	useEffect(() => {
		Object.values(features).forEach(f => {
			if (f.initialized) {
				return
			}
			f.initialize(store.get, store.set)
			f.initialized = true
		})
	}, [])

	return (
		<ConfigProvider>
			<Grid background='bg.muted' templateRows='3rem calc(100% - 3rem)' width='100dvw' height='100dvh'>
				<Header></Header>
				<Grid templateColumns={`${sidebarSize} calc(100% - ${sidebarSize})`} width='full' height='full' transition='grid-template-columns 0.1s'>
					<Sidebar></Sidebar>
					<Box
						width='full'
						height='full'
						overflow='hidden'
						background='bg.subtle'
						borderTopLeftRadius='lg'
					>
						<pageData.component></pageData.component>
					</Box>
				</Grid>
			</Grid>
			<Version></Version>
		</ConfigProvider>
	)
}
