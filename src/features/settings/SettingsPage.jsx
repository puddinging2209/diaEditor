import { Grid, GridItem } from '@chakra-ui/react'
import { Header } from './components/Header'
import { SettingsList } from './components/SettingsList'
import { Sidebar } from './components/Sidebar'

export const SettingsPage = () => {
	return (
		<Grid
			width='full'
			height='full'
			templateRows='4rem calc(100% - 4rem)'
			templateColumns='16rem calc(100% - 16rem)'
		>
			<GridItem colSpan={2}>
				<Header></Header>
			</GridItem>
			<GridItem
				overflowY='auto'
			>
				<Sidebar></Sidebar>
			</GridItem>
			<GridItem
				height='full'
				display='flex'
				overflowY='auto'
				justifyContent='center'
			>
				<SettingsList></SettingsList>
			</GridItem>
		</Grid>
	)
}
