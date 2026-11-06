import { StackSeparator, Text, VStack } from '@chakra-ui/react'
import { SettingItem } from '../SettingItem'

export const Group = ({ itemData }) => {
	return (
		<VStack
			width='full'
			alignItems='flex-start'
			gap={2}
		>
			<Text>{itemData.name}</Text>
			<VStack
				width='full'
				padding='1rem'
				templateColumns='1fr max-content'
				background='bg.muted'
				borderRadius='md'
				separator={
					<StackSeparator></StackSeparator>
				}
			>
				{itemData.items.map((e, i) => <SettingItem itemData={e} key={i}></SettingItem>)}
			</VStack>
		</VStack>
	)
}
