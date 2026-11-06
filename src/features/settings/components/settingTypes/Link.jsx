import { SimpleGrid, Text, VStack } from '@chakra-ui/react'
import { HiArrowTopRightOnSquare } from 'react-icons/hi2'

export const Link = ({ itemData }) => {
	return (
		<a
			style={{
				display: 'block',
				width: '100%'
			}}
			href={itemData.url}
			target='_blank'
		>
			<SimpleGrid
				width='full'
				minHeight='3rem'
				templateColumns='1fr max-content'
				alignItems='center'
				gap={4}
			>
				<VStack alignItems='flex-start' gap={0.5}>
					<Text>{itemData.name}</Text>
				</VStack>

				<HiArrowTopRightOnSquare size='1.5rem'></HiArrowTopRightOnSquare>
			</SimpleGrid>
		</a>
	)
}
