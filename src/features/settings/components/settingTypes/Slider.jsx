import { SliderControl, SliderDraggingIndicator, SliderRange, SliderRoot, SliderThumb, SliderTrack, SliderValueText, Text, VStack } from '@chakra-ui/react'
import { useAtom } from 'jotai'
import { settingAtom } from '../../../../state/settingAtom'

export const Slider = ({ itemData }) => {
	const itemAtom = settingAtom(itemData.id)
	const [value, setValue] = useAtom(itemAtom)

	return (
		<VStack
			width='full'
			minHeight='3rem'
			alignItems='flex-start'
			gap={4}
		>
			<VStack alignItems='flex-start' gap={0.5}>
				<Text>{itemData.name}</Text>
				<Text color='fg.muted' fontSize='sm'>{itemData.description}</Text>
			</VStack>

			<SliderRoot
				width='full'
				min={itemData.min}
				max={itemData.max}
				step={itemData.step}
				value={[value]}
				onValueChange={e => setValue(e.value[0])}
			>
				<SliderControl>
					<SliderTrack>
						<SliderRange />
					</SliderTrack>
					<SliderThumb>
						<SliderDraggingIndicator
							layerStyle='fill.solid'
							top='6'
							rounded='sm'
							px='1.5'
						>
							<SliderValueText />
						</SliderDraggingIndicator>
					</SliderThumb>
				</SliderControl>
			</SliderRoot>
		</VStack>
	)
}
