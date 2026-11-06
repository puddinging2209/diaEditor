import { Flex, Grid, Image, Text, VStack } from '@chakra-ui/react'
import { appInfo } from '../../../../../data/appInfo'

export const AppInfo = ({ itemData }) => {
	return (
		<Grid
			width='full'
			templateColumns='3rem calc(100% - 3rem)'
			gap={4}
		>
			<Image src='./icons/128.png' aspectRatio='1/1' draggable={false}></Image>
			<VStack gap={0} alignItems='flex-start'>
				<Flex alignItems='baseline' gap={1}>
					<Text fontSize='lg'>{appInfo.name}</Text>
					<Text color='fg.muted' fontSize='sm'>v{appInfo.version}</Text>
				</Flex>
				<Flex alignItems='baseline' gap={1} color='fg.muted' fontSize='sm'>
					<Text>ビルド日時: {new Date(appInfo.buildAt).toLocaleString()}</Text>
					<Text>({appInfo.lastCommit})</Text>
				</Flex>
			</VStack>
		</Grid>
	)
}
