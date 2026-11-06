import { Box, Heading, HStack, Icon, Image } from '@chakra-ui/react'
import { appInfo } from '../../../data/appInfo'
import { CommandPlatte } from '../../command/comamndPlatte'
import { MenuButton } from './MenuButton'

export const Header = () => {
	return (
		<HStack
			height='full'
			paddingRight='calc(100% - env(titlebar-area-width, 100%))'
			justifyContent='space-between'
			style={{ appRegion: 'drag' }}
		>
			<HStack height='full' gap={1}>
				<MenuButton></MenuButton>
				<HStack height='full' alignItems='center' justifyContent='space-between'>
					<HStack alignItems='center' gap={1}>
						<Icon asChild>
							<Image src='./icons/128.png' height={6} aspectRatio='1/1' draggable={false}></Image>
						</Icon>
						<Heading fontWeight='normal' size='lg' as='h1'>
							{appInfo.name}
						</Heading>
					</HStack>
					<HStack>
					</HStack>
				</HStack>
			</HStack>
			<Box width='1/2' zIndex='overlay'>
				<CommandPlatte></CommandPlatte>
			</Box>
			<Box></Box>
		</HStack>
	)
}
