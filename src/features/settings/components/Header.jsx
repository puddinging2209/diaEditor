import { Flex, Heading } from '@chakra-ui/react'

export const Header = () => {
	return (
		<Flex
			direction='column'
			justifyContent='center'
			paddingInline={4}
			height='full'
		>
			<Heading fontWeight='normal' size='xl' as='h2'>
				設定
			</Heading>
		</Flex>
	)
}
