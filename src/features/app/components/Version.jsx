import { Box } from '@chakra-ui/react'
import { appInfo } from '../../../data/appInfo'

export const Version = () => {
	return (
		<Box
			position='absolute'
			right='3'
			bottom='1'
			color={appInfo.isDev ? 'red.solid' : 'fg.muted'}
			fontSize='sm'
			inert
		>{appInfo.isDev ? 'Dev - ' : ''}{appInfo.version}{` (${appInfo.lastCommit})`}</Box>
	)
}
